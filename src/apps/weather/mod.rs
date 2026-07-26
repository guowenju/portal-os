//! 天气应用后端：代理 uapis.cn 并提供桌面宠物可消费的天气摘要。

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::get,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tracing::warn;

const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(5);
const UAPI_WEATHER_ENDPOINT: &str = "https://uapis.cn/api/v1/misc/weather";

/// 创建天气应用 API 路由。
pub fn router() -> Router {
    let state = WeatherState {
        client: reqwest::Client::builder()
            .timeout(UPSTREAM_TIMEOUT)
            .build()
            .expect("创建天气 HTTP 客户端失败"),
        forecast_cache: Arc::new(Mutex::new(HashMap::new())),
    };

    Router::new()
        .route("/weather/forecast", get(get_weather_forecast))
        .with_state(state)
}

/// 天气应用共享状态。
#[derive(Clone)]
struct WeatherState {
    /// 复用的 HTTP 客户端。
    client: reqwest::Client,
    /// 按城市缓存天气预报结果。
    forecast_cache: Arc<Mutex<HashMap<String, CacheEntry<WeatherForecast>>>>,
}

/// 简单内存缓存项。
#[derive(Clone)]
struct CacheEntry<T> {
    /// 缓存写入时间。
    stored_at: Instant,
    /// 缓存数据。
    value: T,
}

/// 天气查询参数。
#[derive(Debug, Deserialize)]
struct ForecastQuery {
    /// 城市名或行政区划代码；为空时由 uapis.cn 根据请求来源自动定位。
    city: Option<String>,
}

/// uapis.cn 天气响应。
#[derive(Debug, Deserialize)]
struct UapiWeatherResponse {
    /// 省份。
    province: String,
    /// 城市名称。
    city: String,
    /// 行政区划代码。
    adcode: String,
    /// 天气文本。
    weather: String,
    /// 天气图标代码。
    weather_icon: String,
    /// 实时温度。
    temperature: f64,
    /// 风向。
    wind_direction: String,
    /// 风力。
    wind_power: String,
    /// 相对湿度。
    humidity: u8,
    /// 报告时间。
    report_time: String,
}

/// 前端消费的天气摘要。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WeatherForecast {
    /// 纬度。
    latitude: Option<f64>,
    /// 经度。
    longitude: Option<f64>,
    /// 天气数据来源。
    provider: WeatherProvider,
    /// 数据来源返回的位置名称。
    location_name: String,
    /// 省份或一级行政区。
    admin1: String,
    /// 行政区划代码。
    adcode: String,
    /// 当前温度。
    temperature: f64,
    /// 温度单位。
    temperature_unit: String,
    /// 天气代码。
    weather_code: i32,
    /// 天气分组，用于宠物状态映射。
    condition: WeatherCondition,
    /// 天气文本。
    weather_text: String,
    /// 当前降水量。
    precipitation: f64,
    /// 降水单位。
    precipitation_unit: String,
    /// 当前风速。
    wind_speed: f64,
    /// 风力或风速文本。
    wind_text: String,
    /// 风速单位。
    wind_speed_unit: String,
    /// 风向。
    wind_direction: String,
    /// 相对湿度。
    humidity: Option<u8>,
    /// 天气数据时间。
    observed_at: String,
    /// 天气时区。
    timezone: String,
}

/// 天气分组。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum WeatherCondition {
    /// 晴朗。
    Clear,
    /// 多云。
    Cloudy,
    /// 雾。
    Fog,
    /// 雨。
    Rain,
    /// 雪。
    Snow,
    /// 雷雨。
    Thunderstorm,
    /// 未知天气。
    Unknown,
}

/// 天气数据来源。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum WeatherProvider {
    /// uapis.cn 城市天气实况。
    Uapis,
}

/// 统一 API 响应载荷。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiResponse<T: Serialize> {
    /// 请求是否成功。
    success: bool,
    /// HTTP 风格状态码。
    code: u16,
    /// 响应消息。
    message: String,
    /// 响应数据。
    data: Option<T>,
    /// 业务错误码。
    error_code: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    /// 构造成功响应。
    fn ok(message: impl Into<String>, data: T) -> Self {
        Self {
            success: true,
            code: 200,
            message: message.into(),
            data: Some(data),
            error_code: None,
        }
    }

    /// 构造失败响应。
    fn error(code: u16, message: impl Into<String>, error_code: impl Into<String>) -> Self {
        Self {
            success: false,
            code,
            message: message.into(),
            data: None,
            error_code: Some(error_code.into()),
        }
    }
}

/// 读取当前天气摘要。
async fn get_weather_forecast(
    State(state): State<WeatherState>,
    Query(query): Query<ForecastQuery>,
) -> (StatusCode, Json<ApiResponse<WeatherForecast>>) {
    let city = query
        .city
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let cache_key = city
        .map(|value| format!("city:{}", value.to_lowercase()))
        .unwrap_or_else(|| "auto".to_string());
    if let Some(cached) = get_cached(&state.forecast_cache, &cache_key) {
        return (
            StatusCode::OK,
            Json(ApiResponse::ok("天气读取成功", cached)),
        );
    }

    match fetch_uapi_forecast(&state.client, city).await {
        Ok(forecast) => {
            set_cached(&state.forecast_cache, cache_key, forecast.clone());
            (
                StatusCode::OK,
                Json(ApiResponse::ok("天气读取成功", forecast)),
            )
        }
        Err(error) => {
            warn!(error = %error, city = city.unwrap_or("auto"), "读取 uapis.cn 天气失败");
            let (status, message, error_code) = if is_uapi_location_not_found(&error) {
                (
                    StatusCode::NOT_FOUND,
                    if city.is_some() {
                        "没有找到这个城市"
                    } else {
                        "自动定位天气失败，请手动设置城市"
                    },
                    "WEATHER_CITY_NOT_FOUND",
                )
            } else {
                (
                    StatusCode::BAD_GATEWAY,
                    if city.is_some() {
                        "天气服务暂时不可用"
                    } else {
                        "自动定位天气失败，请手动设置城市"
                    },
                    "WEATHER_UPSTREAM_ERROR",
                )
            };
            (
                status,
                Json(ApiResponse::error(status.as_u16(), message, error_code)),
            )
        }
    }
}

/// 请求 uapis.cn 天气；未传城市时由上游根据请求来源自动定位。
async fn fetch_uapi_forecast(
    client: &reqwest::Client,
    city: Option<&str>,
) -> anyhow::Result<WeatherForecast> {
    let mut request = client.get(UAPI_WEATHER_ENDPOINT);
    if let Some(city) = city {
        request = request.query(&[("city", city)]);
    }

    let response = request
        .send()
        .await?
        .error_for_status()
        .map_err(|error| anyhow::anyhow!(error))?
        .json::<UapiWeatherResponse>()
        .await?;

    Ok(WeatherForecast {
        latitude: None,
        longitude: None,
        provider: WeatherProvider::Uapis,
        location_name: response.city.clone(),
        admin1: response.province,
        adcode: response.adcode,
        temperature: response.temperature,
        temperature_unit: "°C".to_string(),
        weather_code: response.weather_icon.parse::<i32>().unwrap_or_default(),
        condition: classify_weather_text(&response.weather),
        weather_text: response.weather,
        precipitation: 0.0,
        precipitation_unit: String::new(),
        wind_speed: 0.0,
        wind_text: response.wind_power,
        wind_speed_unit: String::new(),
        wind_direction: response.wind_direction,
        humidity: Some(response.humidity),
        observed_at: response.report_time,
        timezone: "Asia/Shanghai".to_string(),
    })
}

/// 根据中文天气文本归类天气。
fn classify_weather_text(text: &str) -> WeatherCondition {
    if text.contains('雷') {
        return WeatherCondition::Thunderstorm;
    }
    if text.contains('雪') || text.contains("冻雨") {
        return WeatherCondition::Snow;
    }
    if text.contains('雨') || text.contains("阵雨") || text.contains("毛毛雨") {
        return WeatherCondition::Rain;
    }
    if text.contains('雾') || text.contains("霾") || text.contains("沙尘") {
        return WeatherCondition::Fog;
    }
    if text.contains('云') || text.contains('阴') {
        return WeatherCondition::Cloudy;
    }
    if text.contains('晴') {
        return WeatherCondition::Clear;
    }
    WeatherCondition::Unknown
}

/// 判断 uapis.cn 是否返回城市不存在。
fn is_uapi_location_not_found(error: &anyhow::Error) -> bool {
    error
        .chain()
        .filter_map(|error| error.downcast_ref::<reqwest::Error>())
        .any(|error| error.status() == Some(StatusCode::NOT_FOUND))
}

/// 读取仍在有效期内的缓存。
fn get_cached<T: Clone>(
    cache: &Arc<Mutex<HashMap<String, CacheEntry<T>>>>,
    key: &str,
) -> Option<T> {
    let Ok(cache) = cache.lock() else {
        return None;
    };
    let entry = cache.get(key)?;
    if entry.stored_at.elapsed() <= CACHE_TTL {
        Some(entry.value.clone())
    } else {
        None
    }
}

/// 写入缓存。
fn set_cached<T>(cache: &Arc<Mutex<HashMap<String, CacheEntry<T>>>>, key: String, value: T) {
    let Ok(mut cache) = cache.lock() else {
        return;
    };
    cache.insert(
        key,
        CacheEntry {
            stored_at: Instant::now(),
            value,
        },
    );
}
