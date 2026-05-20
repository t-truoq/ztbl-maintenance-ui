import axios from 'axios'

const SAP_SERVICE = '/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001'
const SAP_CLIENT = '324'

const api = axios.create({
  baseURL: SAP_SERVICE,
  params: { 'sap-client': SAP_CLIENT },
  headers: { 'Content-Type': 'application/json' }
})

let csrfToken = ''

async function fetchCsrfToken() {
  const res = await api.get('/', {
    headers: { 'X-CSRF-Token': 'Fetch' }
  })
  csrfToken = res.headers['x-csrf-token'] || ''
  return csrfToken
}

export async function getTables() {
  const res = await api.get('/TableConfig', {
    params: {
      'sap-client': SAP_CLIENT,
      '$select': 'TableName,Description,ConfigUuid,ActiveFlag,ApprovalRequired'
    }
  })
  return res.data.value
}

export async function getFieldConfig(tableName) {
  const res = await api.get('/FieldConfig', {
    params: {
      'sap-client': SAP_CLIENT,
      '$filter': `TableName eq '${tableName}'`,
      '$orderby': 'DisplayOrder'
    }
  })
  return res.data.value
}

export async function getTableData(configUuid, tableName, maxRows = 100) {
  await fetchCsrfToken()
  const res = await api.post(
    `/TableConfig(ConfigUuid=${configUuid},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.getTableData`,
    {
      table_name: tableName,
      where_clause: '',
      max_rows: maxRows
    },
    { headers: { 'X-CSRF-Token': csrfToken } }
  )
  return res.data
}

export async function createTableConfig(data) {
  await fetchCsrfToken()
  const res = await api.post('/TableConfig', data, {
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.data
}

export async function updateTableConfig(configUuid, data) {
  await fetchCsrfToken()
  const res = await api.patch(
    `/TableConfig(ConfigUuid=${configUuid},IsActiveEntity=true)`,
    data,
    { headers: { 'X-CSRF-Token': csrfToken } }
  )
  return res.data
}

export async function deleteTableConfig(configUuid) {
  await fetchCsrfToken()
  await api.delete(
    `/TableConfig(ConfigUuid=${configUuid},IsActiveEntity=true)`,
    { headers: { 'X-CSRF-Token': csrfToken } }
  )
}