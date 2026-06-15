import { MessageBox, MessageBoxType, MessageBoxAction } from '@ui5/webcomponents-react'

interface FKErrorDialogProps {
  open: boolean
  message: string
  onClose: () => void
}

/**
 * Error dialog shown when a delete is blocked by a foreign-key constraint.
 * Displays the parsed, human-readable FK error message from the backend.
 */
export default function FKErrorDialog({ open, message, onClose }: FKErrorDialogProps) {
  return (
    <MessageBox
      open={open}
      type={MessageBoxType.Error}
      titleText="Cannot Delete Record"
      actions={[MessageBoxAction.OK]}
      onClose={onClose}
    >
      {message}
    </MessageBox>
  )
}
