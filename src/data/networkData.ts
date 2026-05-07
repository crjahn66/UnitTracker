export interface NetworkEntry {
  gatewayIp: string;
  plcIp: string;
  chillerIp: string;
  fieldServerIp: string;
  bmsPath: string;
  bmsSourceElement: string;
}

// Key: "${side}-${unitNumber}"  e.g. "South-1", "North-14"
// Columns E–H, J–K from the IP address spreadsheet
const NETWORK_DATA: Record<string, NetworkEntry> = {
  // ── South Side ──────────────────────────────────────────────────────────────
  'South-1':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.120', chillerIp: '10.91.41.119', fieldServerIp: '10.91.41.220', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_2_1.MasterToPsk' },
  'South-2':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.41',  chillerIp: '10.91.41.40',  fieldServerIp: '10.91.41.221', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_A_2_1.MasterToPsk' },
  'South-3':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.123', chillerIp: '10.91.41.122', fieldServerIp: '10.91.41.222', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_4_1.MasterToPsk' },
  'South-4':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.128', chillerIp: '10.91.41.127', fieldServerIp: '10.91.41.223', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_2_2.MasterToPsk' },
  'South-5':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.48',  chillerIp: '10.91.41.47',  fieldServerIp: '10.91.41.224', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_B_4_1.MasterToPsk' },
  'South-6':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.131', chillerIp: '10.91.41.130', fieldServerIp: '10.91.41.225', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_4_2.MasterToPsk' },
  'South-7':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.136', chillerIp: '10.91.41.135', fieldServerIp: '10.91.41.226', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_2_3.MasterToPsk' },
  'South-8':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.55',  chillerIp: '10.91.41.54',  fieldServerIp: '10.91.41.227', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_A_2_2.MasterToPsk' },
  'South-9':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.139', chillerIp: '10.91.41.138', fieldServerIp: '10.91.41.228', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_4_3.MasterToPsk' },
  'South-10': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.144', chillerIp: '10.91.41.143', fieldServerIp: '10.91.41.229', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_2_4.MasterToPsk' },
  'South-11': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.61',  chillerIp: '10.91.41.60',  fieldServerIp: '10.91.41.230', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_B_4_2.MasterToPsk' },
  'South-12': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.147', chillerIp: '10.91.41.146', fieldServerIp: '10.91.41.231', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_4_4.MasterToPsk' },
  'South-13': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.152', chillerIp: '10.91.41.151', fieldServerIp: '10.91.41.232', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_2_5.MasterToPsk' },
  'South-14': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.67',  chillerIp: '10.91.41.66',  fieldServerIp: '10.91.41.233', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_A_2_3.MasterToPsk' },
  'South-15': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.155', chillerIp: '10.91.41.154', fieldServerIp: '10.91.41.234', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_4_5.MasterToPsk' },
  'South-16': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.115', chillerIp: '10.91.41.114', fieldServerIp: '10.91.41.235', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_4_6.MasterToPsk' },
  'South-17': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.90',  chillerIp: '10.91.61.89',  fieldServerIp: '10.91.62.150', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_A_3_1.MasterToPsk' },
  'South-18': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.4',   chillerIp: '10.91.61.3',   fieldServerIp: '10.91.62.151', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'PDC_A_3_1.MasterToPsk' },
  'South-19': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.93',  chillerIp: '10.91.61.92',  fieldServerIp: '10.91.62.152', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_C_2_1.MasterToPsk' },
  'South-20': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.98',  chillerIp: '10.91.61.97',  fieldServerIp: '10.91.62.153', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_A_3_2.MasterToPsk' },
  'South-21': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.11',  chillerIp: '10.91.61.10',  fieldServerIp: '10.91.62.154', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'PDC_C_2_1.MasterToPsk' },
  'South-22': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.101', chillerIp: '10.91.61.100', fieldServerIp: '10.91.62.155', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_C_2_2.MasterToPsk' },
  'South-23': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.106', chillerIp: '10.91.61.105', fieldServerIp: '10.91.62.156', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_A_3_3.MasterToPsk' },
  'South-24': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.19',  chillerIp: '10.91.61.18',  fieldServerIp: '10.91.62.157', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'PDC_A_3_2.MasterToPsk' },
  'South-25': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.109', chillerIp: '10.91.61.108', fieldServerIp: '10.91.62.158', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_C_2_3.MasterToPsk' },

  // ── North Side ──────────────────────────────────────────────────────────────
  'North-1':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.72',  chillerIp: '10.91.41.71',  fieldServerIp: '10.91.41.237', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_1_1.MasterToPsk' },
  'North-2':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.4',   chillerIp: '10.91.41.3',   fieldServerIp: '10.91.41.238', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_A_1_1.MasterToPsk' },
  'North-3':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.75',  chillerIp: '10.91.41.74',  fieldServerIp: '10.91.41.239', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_2_1.MasterToPsk' },
  'North-4':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.80',  chillerIp: '10.91.41.79',  fieldServerIp: '10.91.41.240', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_1_2.MasterToPsk' },
  'North-5':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.10',  chillerIp: '10.91.41.9',   fieldServerIp: '10.91.41.241', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_B_2_1.MasterToPsk' },
  'North-6':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.83',  chillerIp: '10.91.41.82',  fieldServerIp: '10.91.41.242', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_2_2.MasterToPsk' },
  'North-7':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.93',  chillerIp: '10.91.41.87',  fieldServerIp: '10.91.41.243', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_1_3.MasterToPsk' },
  'North-8':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.16',  chillerIp: '10.91.41.15',  fieldServerIp: '10.91.41.244', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_A_1_2.MasterToPsk' },
  'North-9':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.91',  chillerIp: '10.91.41.90',  fieldServerIp: '10.91.41.245', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_2_3.MasterToPsk' },
  'North-10': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.96',  chillerIp: '10.91.41.95',  fieldServerIp: '10.91.41.246', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_1_4.MasterToPsk' },
  'North-11': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.22',  chillerIp: '10.91.41.21',  fieldServerIp: '10.91.41.247', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_B_2_2.MasterToPsk' },
  'North-12': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.99',  chillerIp: '10.91.41.98',  fieldServerIp: '10.91.41.248', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_2_4.MasterToPsk' },
  'North-13': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.104', chillerIp: '10.91.41.103', fieldServerIp: '10.91.41.249', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_1_5.MasterToPsk' },
  'North-14': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.28',  chillerIp: '10.91.41.27',  fieldServerIp: '10.91.41.250', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_A_1_3.MasterToPsk' },
  'North-15': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.107', chillerIp: '10.91.41.106', fieldServerIp: '10.91.41.251', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_B_2_5.MasterToPsk' },
  'North-16': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.112', chillerIp: '10.91.41.111', fieldServerIp: '10.91.41.252', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'USS_A_1_6.MasterToPsk' },
  'North-17': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.34',  chillerIp: '10.91.41.33',  fieldServerIp: '10.91.41.253', bmsPath: '2, 10.91.40.89, 1, 0', bmsSourceElement: 'PDC_B_2_3.MasterToPsk' },
  'North-18': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.138', chillerIp: '10.91.61.137', fieldServerIp: '10.91.62.159', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_B_1_1.MasterToPsk' },
  'North-19': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.48',  chillerIp: '10.91.61.47',  fieldServerIp: '10.91.62.160', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'PDC_B_1_1.MasterToPsk' },
  'North-20': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.141', chillerIp: '10.91.61.140', fieldServerIp: '10.91.62.161', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_C_5_1.MasterToPsk' },
  'North-21': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.146', chillerIp: '10.91.61.145', fieldServerIp: '10.91.62.162', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_B_1_2.MasterToPsk' },
  'North-22': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.55',  chillerIp: '10.91.61.54',  fieldServerIp: '10.91.62.163', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'PDC_C_5_1.MasterToPsk' },
  'North-23': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.149', chillerIp: '10.91.61.148', fieldServerIp: '10.91.62.164', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_C_5_2.MasterToPsk' },
  'North-24': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.154', chillerIp: '10.91.61.153', fieldServerIp: '10.91.62.165', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_B_1_3.MasterToPsk' },
  'North-25': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.63',  chillerIp: '10.91.61.62',  fieldServerIp: '10.91.62.166', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'PDC_B_1_2.MasterToPsk' },
  'North-26': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.157', chillerIp: '10.91.61.156', fieldServerIp: '10.91.62.167', bmsPath: '2, 10.91.60.78, 1, 0', bmsSourceElement: 'USS_C_5_3.MasterToPsk' },
};

export function getNetworkEntry(side: string, unitNumber: number): NetworkEntry | null {
  return NETWORK_DATA[`${side}-${unitNumber}`] ?? null;
}
