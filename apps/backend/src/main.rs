//! 服务入口：加载配置、初始化依赖并启动 HTTP 服务。

use api::routes::create_router;
use clap::{Parser, Subcommand};
use shadow_rs::{formatcp, shadow};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use tokio::signal;
use tracing_subscriber::{fmt::time::ChronoLocal, layer::SubscriberExt, util::SubscriberInitExt};

pub mod api;
pub mod apps;
pub mod services;

shadow!(build);

const VERSION_INFO: &str = formatcp!(
    r#"{}
commit_hash: {}
build_time: {}
build_env: {},{}"#,
    build::PKG_VERSION,
    build::SHORT_COMMIT,
    build::BUILD_TIME,
    build::RUST_VERSION,
    build::RUST_CHANNEL
);

#[derive(Parser, Debug)]
#[command(name = "PortalOS", version = VERSION_INFO)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    #[arg(short = 'p', long = "port")]
    http_port: Option<u16>,

    /// 服务监听的 IP 地址或主机名。例如：127.0.0.1 或 0.0.0.0。
    #[arg(long)]
    host: Option<String>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    InitRuntimeConfig {
        /// 服务监听的 IP 地址或主机名。例如：127.0.0.1 或 0.0.0.0。
        #[arg(long, default_value = "0.0.0.0")]
        host: String,
        #[arg(short = 'p', long = "port", default_value = "9090")]
        http_port: u16,
    },
}

#[tokio::main]
async fn main() {
    init_logging();
    let args = Cli::parse();
    tracing::debug!("Successfully parsed command-line arguments: {:?}", args);

    let app = match create_router().await {
        Ok(app) => app,
        Err(err) => {
            tracing::error!("创建公开站点路由失败：{:?}", err);
            std::process::exit(1);
        }
    };

    let listen_host = "0.0.0.0";
    let listen_port = 9090;
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", listen_host, listen_port))
        .await
        .unwrap();
    log_access_urls("http", listen_port);

    // Run the server with graceful shutdown
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        shutdown_signal().await;
    })
    .await
    .unwrap();
}

/// 打印本机可直接访问的地址，便于在日志中点击打开。
fn log_access_urls(scheme: &str, port: u16) {
    tracing::info!("🚀 Starting server at: {}://127.0.0.1:{}", scheme, port);
    if let Some(lan_ip) = detect_lan_ipv4() {
        tracing::info!("🚀 Starting server at: {}://{}:{}", scheme, lan_ip, port);
    }
}

/// 探测当前主网卡 IPv4 地址，用于打印局域网访问地址。
fn detect_lan_ipv4() -> Option<Ipv4Addr> {
    let candidates = [
        (Ipv4Addr::new(223, 5, 5, 5), 53),
        (Ipv4Addr::new(8, 8, 8, 8), 80),
    ];

    for (target_ip, target_port) in candidates {
        let socket = match UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) {
            Ok(s) => s,
            Err(_) => continue,
        };
        if socket.connect((target_ip, target_port)).is_err() {
            continue;
        }
        if let Ok(addr) = socket.local_addr()
            && let IpAddr::V4(ip) = addr.ip()
            && !ip.is_loopback()
        {
            return Some(ip);
        }
    }

    None
}

/// 为应用程序设置日志记录基础设施。
fn init_logging() {
    // 初始化日志
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                // axum logs rejections from built-in extractors with the `axum::rejection`
                // target, at `TRACE` level. `axum::rejection=trace` enables showing those events
                format!(
                    "{}=info,tower_http=info,axum::rejection=trace",
                    env!("CARGO_CRATE_NAME")
                )
                .into()
            }),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_timer(ChronoLocal::new("%Y-%m-%d %H:%M:%S%.3f".to_string())),
        )
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Received termination signal shutting down");
}
