import { Dialog, Bar, Button, Text, BusyIndicator } from '@ui5/webcomponents-react'
import { formatDeleteSummary } from '../../utils/recordHelpers'
import { FieldMeta, TableRowData } from '../../types'

interface DeleteConfirmDialogProps {
  open: boolean
  deletingRow: TableRowData | null
  allFields: FieldMeta[]
  deleteLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog before deleting a record.
 * Shows a human-readable summary of the record keys.
 */
export default function DeleteConfirmDialog({
  open,
  deletingRow,
  allFields,
  deleteLoading,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog
      {...({
        open,
        headerText: 'Delete Record',
        onAfterClose: () => !deleteLoading && onCancel(),
        footer: (
          <Bar
            design="Footer"
            endContent={
              <>
                <Button design="Transparent" onClick={onCancel} disabled={deleteLoading}>
                  Cancel
                </Button>
                <Button
                  design="Negative"
                  icon={'delete' as any}
                  onClick={onConfirm}
                  disabled={deleteLoading}
                >
                  Delete
                </Button>
              </>
            }
          />
        ),
      } as any)}
    >
      {deleteLoading && <BusyIndicator active size="M" />}
      <Text style={{ whiteSpace: 'pre-line' }}>
        Are you sure you want to delete this record?
        {'\n\n'}
        {deletingRow && formatDeleteSummary(allFields, deletingRow)}
      </Text>
    </Dialog>
  )
}
