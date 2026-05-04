export interface NetworkEntry {
  gatewayIp: string;
  plcIp: string;
  chillerIp: string;
}

// Key: "${side}-${unitNumber}"  e.g. "South-1", "North-14"
// Columns E–G from the IP address spreadsheet (rows 2–6 excluded)
const NETWORK_DATA: Record<string, NetworkEntry> = {
  // ── South Side ──────────────────────────────────────────────────────────────
  'South-1':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.120', chillerIp: '10.91.41.119' },
  'South-2':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.41',  chillerIp: '10.91.41.40'  },
  'South-3':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.123', chillerIp: '10.91.41.122' },
  'South-4':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.128', chillerIp: '10.91.41.127' },
  'South-5':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.48',  chillerIp: '10.91.41.47'  },
  'South-6':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.131', chillerIp: '10.91.41.130' },
  'South-7':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.136', chillerIp: '10.91.41.135' },
  'South-8':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.55',  chillerIp: '10.91.41.54'  },
  'South-9':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.139', chillerIp: '10.91.41.138' },
  'South-10': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.144', chillerIp: '10.91.41.143' },
  'South-11': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.61',  chillerIp: '10.91.41.60'  },
  'South-12': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.147', chillerIp: '10.91.41.146' },
  'South-13': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.152', chillerIp: '10.91.41.151' },
  'South-14': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.67',  chillerIp: '10.91.41.66'  },
  'South-15': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.155', chillerIp: '10.91.41.154' },
  'South-16': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.115', chillerIp: '10.91.41.114' },
  'South-17': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.90',  chillerIp: '10.91.61.89'  },
  'South-18': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.4',   chillerIp: '10.91.61.3'   },
  'South-19': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.93',  chillerIp: '10.91.61.92'  },
  'South-20': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.98',  chillerIp: '10.91.61.97'  },
  'South-21': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.11',  chillerIp: '10.91.61.10'  },
  'South-22': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.101', chillerIp: '10.91.61.100' },
  'South-23': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.106', chillerIp: '10.91.61.105' },
  'South-24': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.19',  chillerIp: '10.91.61.18'  },
  'South-25': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.109', chillerIp: '10.91.61.108' },

  // ── North Side ──────────────────────────────────────────────────────────────
  'North-1':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.72',  chillerIp: '10.91.41.71'  },
  'North-2':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.4',   chillerIp: '10.91.41.3'   },
  'North-3':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.75',  chillerIp: '10.91.41.74'  },
  'North-4':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.80',  chillerIp: '10.91.41.79'  },
  'North-5':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.10',  chillerIp: '10.91.41.9'   },
  'North-6':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.83',  chillerIp: '10.91.41.82'  },
  'North-7':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.93',  chillerIp: '10.91.41.87'  },
  'North-8':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.16',  chillerIp: '10.91.41.15'  },
  'North-9':  { gatewayIp: '10.91.40.1', plcIp: '10.91.41.91',  chillerIp: '10.91.41.90'  },
  'North-10': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.96',  chillerIp: '10.91.41.95'  },
  'North-11': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.22',  chillerIp: '10.91.41.21'  },
  'North-12': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.99',  chillerIp: '10.91.41.98'  },
  'North-13': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.104', chillerIp: '10.91.41.103' },
  'North-14': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.28',  chillerIp: '10.91.41.27'  },
  'North-15': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.107', chillerIp: '10.91.41.106' },
  'North-16': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.112', chillerIp: '10.91.41.111' },
  'North-17': { gatewayIp: '10.91.40.1', plcIp: '10.91.41.34',  chillerIp: '10.91.41.33'  },
  'North-18': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.138', chillerIp: '10.91.61.137' },
  'North-19': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.48',  chillerIp: '10.91.61.47'  },
  'North-20': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.141', chillerIp: '10.91.61.140' },
  'North-21': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.146', chillerIp: '10.91.61.145' },
  'North-22': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.55',  chillerIp: '10.91.61.54'  },
  'North-23': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.149', chillerIp: '10.91.61.148' },
  'North-24': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.154', chillerIp: '10.91.61.153' },
  'North-25': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.63',  chillerIp: '10.91.61.62'  },
  'North-26': { gatewayIp: '10.91.60.1', plcIp: '10.91.61.157', chillerIp: '10.91.61.156' },
};

export function getNetworkEntry(side: string, unitNumber: number): NetworkEntry | null {
  return NETWORK_DATA[`${side}-${unitNumber}`] ?? null;
}
