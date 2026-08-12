import {
  MessageBox,
  MessageBoxType,
  MessageBoxAction,
  FlexBox,
  Text,
  Label,
  Icon,
} from '@ui5/webcomponents-react'

interface ApprovalInfo {
  code: string
  action: 'create' | 'update' | 'delete' | 'save'
}

interface ApprovalSuccessDialogProps {
  open: boolean
  approvalInfo: ApprovalInfo | null
  tableName: string
  onClose: () => void
}

/**
 * Success dialog shown when a backend action triggers an approval workflow.
 * Displays the approval request ID prominently for the user to note.
 */
export default function ApprovalSuccessDialog({
  open,
  approvalInfo,
  tableName,
  onClose,
}: ApprovalSuccessDialogProps) {
  return (
    <MessageBox
      open={open}
      type={MessageBoxType.Success}
      titleText="Approval Request Submitted"
      actions={[MessageBoxAction.OK]}
      onClose={onClose}
    >
      {approvalInfo && (
        <FlexBox direction="Column" gap="8px" style={{ width: '100%' }}>
          <Text>
            Your changes for table <strong>{tableName}</strong> require approval and have been
            successfully submitted.
          </Text>
          <FlexBox
            alignItems="Center"
            gap="12px"
            style={{
              background: 'var(--sapGroup_Background, #f4f6f8)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--sapGroup_BorderColor, #d9d9d9)',
              marginTop: '8px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <Icon
              name="employee-approvals"
              style={{
                color: 'var(--sapContent_NonInteractiveIconColor, #0a6ed1)',
                width: '24px',
                height: '24px',
              }}
            />
            <FlexBox direction="Column" gap="4px">
              <Label style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                Approval Request ID
              </Label>
              <Text
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--sapContent_LabelColor, #133b5c)',
                }}
              >
                {approvalInfo.code}
              </Text>
            </FlexBox>
          </FlexBox>
          <Text style={{ fontSize: '0.85rem', color: '#6a7075', marginTop: '8px' }}>
            The changes will be applied to the database once approved by the system workflow.
          </Text>
        </FlexBox>
      )}
    </MessageBox>
  )
}
