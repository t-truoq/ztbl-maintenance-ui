import React, { useState, useEffect } from 'react'
import {
  ShellBar,
  SideNavigation,
  SideNavigationItem,
  DynamicPage,
  DynamicPageTitle,
  DynamicPageHeader,
  FlexBox,
  Title,
  Text,
  Button,
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Input,
  BusyIndicator,
  MessageStrip,
  Tag,
  Label,
  Toolbar,
  ToolbarSpacer,
  ToolbarSeparator,
  Avatar
} from '@ui5/webcomponents-react'
import { getTables, getFieldConfig, getTableData } from './services/sapApi'

export default function App() {
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [fields, setFields] = useState([])
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { loadTables() }, [])

  async function loadTables() {
    try {
      setLoading(true)
      const result = await getTables()
      setTables(result)
    } catch(e) {
      setError('Error loading tables: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function fixJson(jsonStr) {
    // Fix timestamps dạng: "FIELD":2026-03-20 07:47:45.385
    jsonStr = jsonStr.replace(
      /:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)/g,
      ':"$1"'
    )
    // Fix timestamps dạng: "FIELD":20260320084745.0000000
    jsonStr = jsonStr.replace(
      /:\s*(\d{14}\.\d+)/g,
      ':"$1"'
    )
    // Fix unquoted numbers that are too large (UUID bytes etc)
    jsonStr = jsonStr.replace(
      /:\s*([A-Za-z0-9+/=]{20,}),/g,
      ':"$1",'
    )
    return jsonStr
  }

  async function handleSelectTable(table) {
    try {
      setLoading(true)
      setError('')
      setSelectedTable(table)

      const fieldResult = await getFieldConfig(table.TableName)
      setFields(fieldResult.filter(f => f.HiddenFlag !== 'X'))

      const dataResult = await getTableData(table.ConfigUuid, table.TableName)

      if (dataResult.data_json) {
        try {
          const fixedJson = fixJson(dataResult.data_json)
          const rows = JSON.parse(fixedJson)
          setData(Array.isArray(rows) ? rows : [rows])
        } catch(e) {
          console.error('Parse error:', e.message)
          console.error('JSON:', dataResult.data_json.substring(0, 500))
          setError('JSON parse error: ' + e.message)
          setData([])
        }
      } else {
        setData([])
      }
    } catch(e) {
      setError('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredData = data.filter(row =>
    Object.values(row).some(v =>
      String(v).toLowerCase().includes(searchQuery.toLowerCase())
    )
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

      <ShellBar
        primaryTitle="Dynamic Table Maintenance"
        secondaryTitle="Z-Table Manager"
        profile={<Avatar initials="DV" colorScheme="Accent6" />}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <div style={{ width: '260px', borderRight: '1px solid #d9d9d9', background: '#fff', overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Label>Registered Tables ({tables.length})</Label>
          </div>
          <SideNavigation>
            {tables.map(t => (
              <SideNavigationItem
                key={t.ConfigUuid}
                text={t.TableName}
                icon="table-view"
                selected={selectedTable?.ConfigUuid === t.ConfigUuid}
                onClick={() => handleSelectTable(t)}
              />
            ))}
          </SideNavigation>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: '#f5f6f7' }}>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <BusyIndicator active size="Medium" />
            </div>
          )}

          {error && (
            <div style={{ padding: '1rem' }}>
              <MessageStrip design="Negative" onClose={() => setError('')}>
                {error}
              </MessageStrip>
            </div>
          )}

          {!selectedTable && !loading && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '60vh',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <Title level="H3">Select a table to maintain</Title>
              <Text>Choose a table from the left navigation</Text>
            </div>
          )}

          {selectedTable && !loading && (
            <DynamicPage
              headerTitle={
                <DynamicPageTitle
                  heading={<Title>{selectedTable.TableName}</Title>}
                  subheading={<Text>{selectedTable.Description}</Text>}
                  actions={
                    <>
                      <Button design="Emphasized" icon="add">Create</Button>
                      <Button icon="edit">Edit</Button>
                      <Button design="Negative" icon="delete">Delete</Button>
                      <ToolbarSeparator />
                      <Button icon="excel-attachment">Export</Button>
                      <Button
                        icon="refresh"
                        onClick={() => handleSelectTable(selectedTable)}
                      >
                        Refresh
                      </Button>
                    </>
                  }
                />
              }
              headerContent={
                <DynamicPageHeader>
                  <FlexBox gap="2rem" alignItems="Center">
                    <FlexBox direction="Column" gap="4px">
                      <Label>Table Name</Label>
                      <Text>{selectedTable.TableName}</Text>
                    </FlexBox>
                    <FlexBox direction="Column" gap="4px">
                      <Label>Records</Label>
                      <Text>{filteredData.length}</Text>
                    </FlexBox>
                    <FlexBox direction="Column" gap="4px">
                      <Label>Status</Label>
                      <Tag colorScheme={selectedTable.ActiveFlag === 'X' ? '8' : '2'}>
                        {selectedTable.ActiveFlag === 'X' ? 'Active' : 'Inactive'}
                      </Tag>
                    </FlexBox>
                    <FlexBox direction="Column" gap="4px">
                      <Label>Approval Required</Label>
                      <Tag colorScheme={selectedTable.ApprovalRequired === 'X' ? '6' : '1'}>
                        {selectedTable.ApprovalRequired === 'X' ? 'Yes' : 'No'}
                      </Tag>
                    </FlexBox>
                  </FlexBox>
                </DynamicPageHeader>
              }
            >
              <Toolbar>
                <Input
                  placeholder="Search..."
                  icon="search"
                  value={searchQuery}
                  onInput={e => setSearchQuery(e.target.value)}
                  style={{ width: '250px' }}
                />
                <ToolbarSpacer />
                <Text style={{ fontSize: '13px', color: '#6a7075' }}>
                  {filteredData.length} of {data.length} records
                </Text>
              </Toolbar>

              <Table
                headerRow={
                  <TableHeaderRow>
                    {fields.map(f => (
                      <TableHeaderCell key={f.FieldName} minWidth="120px">
                        <Label>
                          {f.LabelText || f.FieldName}
                          {f.IsKeyField === 'X' && ' 🔑'}
                        </Label>
                      </TableHeaderCell>
                    ))}
                    <TableHeaderCell minWidth="80px">
                      <Label>Actions</Label>
                    </TableHeaderCell>
                  </TableHeaderRow>
                }
              >
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={fields.length + 1}>
                      <Text>No data available</Text>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row, i) => (
                    <TableRow key={i}>
                      {fields.map(f => (
                        <TableCell key={f.FieldName}>
                          <Text>{row[f.FieldName] || ''}</Text>
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button design="Transparent" icon="edit" />
                        <Button design="Transparent" icon="delete" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </Table>

            </DynamicPage>
          )}

        </div>
      </div>
    </div>
  )
}