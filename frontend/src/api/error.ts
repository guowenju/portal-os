import type { AxiosError } from 'axios'
import type { ApiResponse } from './interface'

export function handleAxiosError(error: AxiosError): ApiResponse<null> {
  const status = error.response?.status ?? -1
  const responseData = error.response?.data as Partial<ApiResponse<unknown>> | undefined
  let message: string | undefined
  const errorCode = responseData?.errorCode

  if (responseData) {
    if (typeof responseData.data === 'string') {
      message = responseData.data
    } else if (typeof responseData.message === 'string') {
      message = responseData.message
    }
  }

  if (!message) {
    switch (status) {
      case 500:
        message = '请检查主控服务是否运行'
        break
      default:
        message = error.message ?? 'Unknown error'
        break
    }
  }
  return {
    success: false,
    code: status,
    message,
    errorCode,
    data: null,
  }
}
