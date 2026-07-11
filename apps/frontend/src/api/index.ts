import axios from 'axios'
import {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  HttpStatusCode,
} from 'axios'
import type { ApiResponse } from '@/api/interface'
import { handleAxiosError } from './error'

const config = {
  baseURL: '/api/v1',
  timeout: 5000,
  withCredentials: true,
}

/**
 * @description HTTP 请求服务类
 */
class HttpClient {
  service: AxiosInstance
  /**
   * @description 构造函数，创建 Axios 实例并配置拦截器
   * @param config - AxiosRequestConfig 配置对象
   */
  public constructor(config: AxiosRequestConfig) {
    this.service = axios.create(config)

    this.service.interceptors.response.use(
      (response: AxiosResponse) => {
        // 返回 ApiResponse
        return response.data
      },
      async (error: AxiosError) => {
        if (axios.isAxiosError(error)) {
          const { response, config } = error

          if (response && response.status === HttpStatusCode.Unauthorized && config) {
            return response.data
          }

          if (response) {
            return handleAxiosError(error)
          }
        }

        // 返回一个拒绝的 Promise，以便在调用处捕获错误
        return Promise.reject(error)
      },
    )
  }

  get<T>(url: string, params?: object, _object = {}): Promise<ApiResponse<T>> {
    return this.service.get(url, { params, ..._object })
  }
  post<T>(url: string, params?: object, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.service.post(url, params, config)
  }
  put<T>(url: string, params?: object, _object: AxiosRequestConfig = {}): Promise<ApiResponse<T>> {
    return this.service.put(url, params, _object)
  }
  delete<T>(
    url: string,
    params?: object,
    _object: AxiosRequestConfig = {},
  ): Promise<ApiResponse<T>> {
    return this.service.delete(url, { params, ..._object })
  }
  download<BlobPart>(url: string, params?: object, _object = {}): Promise<BlobPart> {
    return this.service.post(url, params, _object)
  }
  upload<T>(
    url: string,
    params: object = {},
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return this.service.post(url, params, config)
  }
}

export default new HttpClient(config)
