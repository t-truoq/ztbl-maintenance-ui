import { Dialog, Bar, Button, Text } from '@ui5/webcomponents-react'
import { formatDeleteSummary } from '../../utils/recordHelpers'
import { FieldMeta, TableRowData } from '../../types'
import AppLoadingState from '../AppLoadingState'

interface DeleteConfirmDialogProps {
  open: boolean
  deletingRows: TableRowData[]
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
  deletingRows,
  allFields,
  deleteLoading,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const deleteCount = deletingRows.length

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
      {deleteLoading && <AppLoadingState label="Deleting records..." variant="inline" />}
      <Text style={{ whiteSpace: 'pre-line' }}>
        {deleteCount > 1
          ? `Are you sure you want to delete these ${deleteCount} records?`
          : 'Are you sure you want to delete this record?'}
        {'\n\n'}
        {deleteCount === 1 && formatDeleteSummary(allFields, deletingRows[0])}
        {deleteCount > 1 && 'The selected records will be deleted one by one.'}
      </Text>
    </Dialog>
  )
}
