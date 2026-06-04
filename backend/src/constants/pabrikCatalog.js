/** Reference catalog: kode pabrik (field code segment 1) → nama pabrik + kode barang. */

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const k = String(raw ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

const PABRIK_CATALOG = [
  {
    code: '1',
    name: 'PAKERIN',
    items: [
      'PS1',
      'PS1B',
      'PS2',
      'PS2B',
      'PS3',
      'PS3B',
      'PSB',
      'PSBPB',
      'PSBPBSH',
      'PSBPBM',
      'PSBSH',
      'PSK',
      'PSLB',
      'PSLEB',
      'PSM',
      'PSMS',
      'PSMLD',
      'PSPB',
      'PSPBB',
      'PSPBM',
      'PSPBMSH',
      'PSPBMS',
      'PCLMBM2',
      'PSD',
      'PSP',
      'PSTB',
      'PTPB',
      'PH',
      'PH1',
      'PH2',
      'PH3',
      'PHJBB',
      'PWD',
      'PWT',
      'PWTB',
    ],
  },
  {
    code: '2',
    name: 'SUPARMA',
    items: [
      'SB',
      'SBB',
      'SCD',
      'SCB',
      'SDP',
      'SG',
      'SH',
      'SHG1',
      'SHG2',
      'SHG3',
      'SHG4',
      'SIC',
      'SIP',
      'SKW',
      'SKWR',
      'SKC',
      'SKPB',
      'SKPTC',
      'SKPTP',
      'LSR',
      'LSRP',
      'LSDP',
      'LSDPB',
      'LSDPT',
      'LSDTD',
    ],
  },
  {
    code: '3',
    name: 'MEGA SURYA EKA JAYA, ARSARI',
    items: ['LSG', 'LSGMJ', 'LSKD', 'LSKMP', 'LSOD', 'LSSWLA', 'LSSWLAC', 'LSSWLC', 'LSSWLOD'],
  },
  {
    code: '4',
    name: 'SURYAPAM',
    items: ['SRR', 'SRRIP', 'SRRK', 'SRRKB', 'SRRMX', 'SRRMXT', 'SRRXT'],
  },
  {
    code: '5',
    name: 'UTAMA MUDAH - MUI',
    items: [
      'RA',
      'RAB',
      'RAK',
      'RB',
      'RB3',
      'RB3N',
      'RB3R',
      'RB3S',
      'RABON',
      'RAW',
      'RE',
      'RM',
      'RMB',
      'RMS',
      'RTW',
      'RTWLD',
      'BBW',
    ],
  },
  {
    code: '6',
    name: 'ADI PRIMA SURAPRINTA, JAVAKOS',
    items: [
      'JPB',
      'JPBP',
      'JPBP*',
      'JPK',
      'JPKUD',
      'JPM',
      'JPMP',
      'JPMP*',
      'JPOD',
      'JPS',
      'JPSBC',
      'JPSW',
      'JPSS',
      'JPSWLA',
    ],
  },
  {
    code: '7',
    name: 'MEIJIACE INTERNATIONAL',
    items: ['MJR', 'MJR1P', 'MJR20N', 'MJRP', 'MJRPB'],
  },
  {
    code: '8',
    name: 'SURABAYA MEIJIACE',
    items: ['SM1B', 'SM2BP', 'SM2BPB', 'SM3H', 'SM3PP', 'SM3B JP'],
  },
  {
    code: '9',
    name: 'SINARAS',
    items: ['BKH3BP', 'BKH3C', 'BKH3HP', 'BKH3CA', 'BKH3P'],
  },
  {
    code: '10',
    name: 'TAW - KIMA',
    items: ['TKBBP', 'TKB30N', 'TKB30H', 'TKB3PS', 'TKB3PH', 'TKBSWJM', 'TKBSWJAS'],
  },
  {
    code: '11',
    name: 'SUNPAPIR',
    items: ['SPSSA', 'SPSSB', 'SPSSC', 'SPTA', 'SPTB'],
  },
  {
    code: '12',
    name: 'DAYASA',
    items: [
      'DAP01',
      'DAP02P',
      'DAP02KD',
      'DAP02M',
      'DAP02CB',
      'DAP02CM',
      'DAP02CP',
      'DAP02NP',
      'DAP02PC',
      'DAPSWLA',
      'DAPSWLAC',
      'DAPSWLB',
      'DAPSWLBC',
    ],
  },
].map((row, index) => ({
  code: row.code,
  name: row.name,
  sort_order: index + 1,
  items: dedupeItems(row.items),
}));

module.exports = { PABRIK_CATALOG, dedupeItems };
