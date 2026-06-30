import { Button, Modal } from 'animal-island-ui'
import { useConfirmationModalStore } from '@/stores/confirmation-modal'

/**
 * @description 全局确认弹窗，向业务层提供 Promise 式确认结果。
 */
export default function ConfirmationModal() {
  const modalData = useConfirmationModalStore((state) => state.modalData)
  const handleModalResponse = useConfirmationModalStore((state) => state.handleModalResponse)

  return (
    <Modal
      open={modalData.isVisible}
      title={modalData.title}
      onClose={() => handleModalResponse(false)}
      typewriter={false}
      footer={
        <>
          <Button onClick={() => handleModalResponse(false)}>{modalData.cancelText}</Button>
          <Button type="primary" onClick={() => handleModalResponse(true)}>
            {modalData.confirmText}
          </Button>
        </>
      }
    >
      {modalData.message}
    </Modal>
  )
}
