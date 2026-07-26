import { create } from 'zustand'

export interface ConfirmationModalData {
  title: string
  message: string
  confirmText: string
  cancelText: string
  isVisible: boolean
  resolve: ((confirmed: boolean) => void) | null
}

interface ConfirmationModalStore {
  modalData: ConfirmationModalData
  showConfirmation: (
    message: string,
    title?: string,
    confirmText?: string,
    cancelText?: string,
  ) => Promise<boolean>
  handleModalResponse: (confirmed: boolean) => void
}

export const useConfirmationModalStore = create<ConfirmationModalStore>((set, get) => ({
  modalData: {
    title: '',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    isVisible: false,
    resolve: null,
  },
  showConfirmation: (message, title = '确认操作', confirmText = '确认', cancelText = '取消') =>
    new Promise((resolve) => {
      set({
        modalData: {
          title,
          message,
          confirmText,
          cancelText,
          isVisible: true,
          resolve,
        },
      })
    }),
  handleModalResponse: (confirmed) => {
    get().modalData.resolve?.(confirmed)
    set((state) => ({
      modalData: {
        ...state.modalData,
        isVisible: false,
        resolve: null,
      },
    }))
  },
}))
