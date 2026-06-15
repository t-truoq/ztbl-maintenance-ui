import { MessageBox, MessageBoxType, MessageBoxAction } from '@ui5/webcomponents-react'

interface OptimisticLockDialogProps {
  open: boolean
  onRefresh: () => void
  onCancel: () => void
}

/**
 * Error dialog shown when a concurrent modification conflict is detected.
 * Offers the user a "Refresh" action to reload the latest data.
 */
export default function OptimisticLockDialog({
  open,
  onRefresh,
  onCancel,
}: OptimisticLockDialogProps) {
  return (
    <MessageBox
      open={open}
      type={MessageBoxType.Error}
      titleText="Concurrent Modification"
      actions={[MessageBoxAction.Cancel, 'Refresh']}
      emphasizedAction="Refresh"
      onClose={(action: any) => {
        if (action === 'Refresh') {
          onRefresh()
        } else {
          onCancel()
        }
      }}
    >
      This record was modified by another user while you were editing. Refresh to see the latest
      data, then save only the fields you still need to change.
    </MessageBox>
  )
}
