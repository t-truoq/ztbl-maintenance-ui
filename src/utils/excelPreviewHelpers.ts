export function orderExcelPreviewFields(
  fields: string[],
  preferredOrder: string[],
  exactPreferredOrder = false
): string[] {
  const uniqueFields: string[] = []
  const seenFields = new Set<string>()

  const candidateFields = exactPreferredOrder ? preferredOrder : fields
  candidateFields.forEach(field => {
    const normalizedField = String(field || '').trim().toUpperCase()
    if (!normalizedField || normalizedField === '-' || normalizedField === 'ACTION' || seenFields.has(normalizedField)) return
    seenFields.add(normalizedField)
    uniqueFields.push(field)
  })

  const orderByField = new Map(
    preferredOrder.map((field, index) => [String(field || '').trim().toUpperCase(), index])
  )

  return uniqueFields
    .map((field, encounterIndex) => ({ field, encounterIndex }))
    .sort((left, right) => {
      const leftOrder = orderByField.get(left.field.trim().toUpperCase()) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = orderByField.get(right.field.trim().toUpperCase()) ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder || left.encounterIndex - right.encounterIndex
    })
    .map(item => item.field)
}

export function deduplicateExcelMessages(messages: string[]): string[] {
  const uniqueMessages = new Map<string, string>()

  messages.forEach(message => {
    String(message || '')
      .split(';')
      .forEach(part => {
        const displayMessage = part.trim()
        const normalizedMessage = displayMessage
          .toLowerCase()
          .replace(/[.;\s]+$/g, '')
          .replace(/\s+/g, ' ')

        if (normalizedMessage && !uniqueMessages.has(normalizedMessage)) {
          uniqueMessages.set(normalizedMessage, displayMessage)
        }
      })
  })

  return Array.from(uniqueMessages.values())
}
