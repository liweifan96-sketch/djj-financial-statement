/* ============================================================
   DJJ Finance — Sheet layout configuration
   Defines per-sheet: header rows, store groupings, column types.
   The grid renderer uses this to produce clean two-level headers
   instead of raw A/B/C/1/2/3 spreadsheet coords.
   ============================================================ */

window.DJJ_LAYOUTS = {

  // ===== 财务报表核对 =====
  // A/B = 悉尼   C/D = 布里斯班   E/F = 珀斯
  // G–K = 流转毛利核对   L–P = 特殊单据核对
  '财务报表核对': {
    headerRows: 1,                       // row 1 has the headers
    dataStartRow: 2,
    groups: [
      { label: '悉尼 Sydney', color: 'sydney', cols: [1,2], subHeaders: ['项目', '金额'] },
      { label: '布里斯班 Brisbane', color: 'brisbane', cols: [3,4], subHeaders: ['项目', '金额'] },
      { label: '珀斯 Perth', color: 'perth', cols: [5,6], subHeaders: ['项目', '金额'] },
      { label: '流转毛利核对', color: 'neutral', cols: [7,8,9,10,11],
        subHeaders: ['流转方向', '真实毛利率', '采购价(不含税)', '销售价(不含税)', '真实毛利'] },
      { label: '悉尼流转特殊单据', color: 'neutral', cols: [12,13,14,15], subHeaders: ['单号', '采购价', '销售价', '毛利'] },
      { label: '特殊单据采购', color: 'neutral', cols: [16,17,18,19], subHeaders: ['', '', '', ''] },
    ],
    // columns that are pure labels (never editable)
    labelCols: [1,3,5,7,12,16],
    // columns showing money
    moneyCols: [2,4,6,9,10,11,13,14,15,17,18,19],
    // percentage cols
    pctCols: [8],
  },

  // ===== 三张损益表 =====
  // A=项目  B=上月  C=本月  D=变化额  E=变化率%  F=备注
  '悉尼损益表': {
    headerRows: 1,
    dataStartRow: 2,
    groups: [
      { label: '项目 Item', color: 'neutral', cols: [1], subHeaders: [''], flat: true },
      { label: '对比 Compare', color: 'sydney', cols: [2,3,4,5], subHeaders: ['上月', '本月', '变化额', '变化率'] },
      { label: '备注 Notes', color: 'neutral', cols: [6], subHeaders: [''], flat: true },
    ],
    dynamicHeaders: { 2:'lastMonth', 3:'thisMonth' },  // shown as "2026.03 / 2026.04" dynamically
    labelCols: [1,6],
    moneyCols: [2,3,4],
    pctCols: [5],
  },
  '布里斯班损益表': {
    headerRows: 1, dataStartRow: 2,
    groups: [
      { label: '项目 Item', color: 'neutral', cols: [1], subHeaders: [''], flat: true },
      { label: '对比 Compare', color: 'brisbane', cols: [2,3,4,5], subHeaders: ['上月', '本月', '变化额', '变化率'] },
      { label: '备注 Notes', color: 'neutral', cols: [6,7,8,9,10,11,12,13,14,15,16,17,18,19], subHeaders: Array(14).fill('') },
    ],
    dynamicHeaders: { 2:'lastMonth', 3:'thisMonth' },
    labelCols: [1,6,7,8,9,10,11,12,13,14,15,16,17,18,19],
    moneyCols: [2,3,4],
    pctCols: [5],
  },
  '珀斯损益表': {
    headerRows: 1, dataStartRow: 2,
    groups: [
      { label: '项目 Item', color: 'neutral', cols: [1], subHeaders: [''], flat: true },
      { label: '对比 Compare', color: 'perth', cols: [2,3,4,5], subHeaders: ['上月', '本月', '变化额', '变化率'] },
      { label: '备注 Notes', color: 'neutral', cols: [6,7,8,9,10,11,12,13,14,15,16,17,18,19], subHeaders: Array(14).fill('') },
    ],
    dynamicHeaders: { 2:'lastMonth', 3:'thisMonth' },
    labelCols: [1,6,7,8,9,10,11,12,13,14,15,16,17,18,19],
    moneyCols: [2,3,4],
    pctCols: [5],
  },

  // ===== 机型销售统计 (vertical with 门店 as column) =====
  '机型销售统计': {
    headerRows: 1, dataStartRow: 2,
    // flat single-row header from row 1 itself
    useRow1AsHeader: true,
    columnNames: {
      1:'销售单建立时间', 2:'门店', 3:'机型', 4:'数量', 5:'单号', 6:'销售人员',
      7:'Total Amount (含GST)', 8:'车架号', 9:'采购价 (不含GST)', 10:'销售价 (不含GST)',
      11:'主机毛利', 12:'毛利率', 13:'备注'
    },
    labelCols: [3,5,6,8,13,2],
    dateCols: [1],
    moneyCols: [7,9,10,11],
    pctCols: [12],
    storeFilterCol: 2,            // filter dropdown applies to this column
  },

  // ===== 悉尼门店流转 (horizontal — already store-grouped) =====
  // A–E = 悉尼-布里斯班   F–J = 悉尼-珀斯   ... (rest are aggregates)
  '悉尼门店流转': {
    headerRows: 1, dataStartRow: 2,
    groups: [
      { label: '悉尼 → 布里斯班', color: 'brisbane', cols: [1,2,3,4,5],
        subHeaders: ['悉尼PO', '采购价', '布里斯班单据', '流转价', '比率'] },
      { label: '悉尼 → 珀斯', color: 'perth', cols: [6,7,8,9,10],
        subHeaders: ['悉尼PO', '采购价', '珀斯单据', '流转价', '比率'] },
      { label: '汇总核对', color: 'neutral', cols: [11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
        subHeaders: Array(15).fill('') },
    ],
    labelCols: [1,3,6,8,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
    moneyCols: [2,4,7,9],
    pctCols: [5,10],
  },

  // ===== 应收账款及取消定金 (3 stores side-by-side) =====
  // A–G = 悉尼   I–O = 布里斯班   Q–W = 珀斯 (with H, P as spacers)
  '应收账款及取消定金': {
    headerRows: 1, dataStartRow: 2,
    groups: [
      { label: '悉尼 Sydney', color: 'sydney', cols: [1,2,3,4,5,6,7],
        subHeaders: ['订单', '日期', '人员', '销售单全款', '已收款项', '剩余应收款', '系统体现应收款'] },
      { label: '布里斯班 Brisbane', color: 'brisbane', cols: [9,10,11,12,13,14,15],
        subHeaders: ['订单', '日期', '人员', '销售单全款', '已收款项', '剩余应收款', '系统体现应收款'] },
      { label: '珀斯 Perth', color: 'perth', cols: [17,18,19,20,21,22,23],
        subHeaders: ['订单', '日期', '人员', '销售单全款', '已收款项', '剩余应收款', '系统体现应收款'] },
    ],
    hideCols: [8,16],            // spacer columns from original Excel
    labelCols: [1,3,9,11,17,19],
    dateCols: [2,10,18],
    moneyCols: [4,5,6,7,12,13,14,15,20,21,22,23],
  },

  // ===== 门店应付账款 (3 stores side-by-side) =====
  // A–D = 悉尼   F–I = 布里斯班   K–N = 珀斯 (E, J spacers)
  '门店应付账款': {
    headerRows: 1, dataStartRow: 2,
    groups: [
      { label: '悉尼 Sydney', color: 'sydney', cols: [1,2,3,4],
        subHeaders: ['合同号', '总金额', '剩余金额', '备注'] },
      { label: '布里斯班 Brisbane', color: 'brisbane', cols: [6,7,8,9],
        subHeaders: ['合同号', '总金额', '剩余金额', '备注'] },
      { label: '珀斯 Perth', color: 'perth', cols: [11,12,13,14],
        subHeaders: ['合同号', '总金额', '剩余金额', '备注'] },
    ],
    hideCols: [5,10,15],
    labelCols: [1,4,6,9,11,14],
    moneyCols: [2,3,7,8,12,13],
  },

  // ===== 三门店运输费 (vertical, 门店 as column) =====
  '2026.04月三门店运输费': {
    headerRows: 1, dataStartRow: 2,
    useRow1AsHeader: true,
    columnNames: {
      1:'时间', 2:'门店', 3:'GST', 4:'不含GST', 5:'支付金额',
      6:'付费审批单号', 7:'对应销售单', 8:'销售单时间', 9:'收 Deliver Fee'
    },
    dateCols: [1,8],
    labelCols: [2,6,7],
    moneyCols: [3,4,5,9],
    storeFilterCol: 2,
  },

  // ===== 门店租赁设备统计 (3 stores side-by-side) =====
  // A–F=悉尼  H–M=布里斯班  O–T=珀斯
  '门店租赁设备统计': {
    headerRows: 1, dataStartRow: 2,
    groups: [
      { label: '悉尼 Sydney', color: 'sydney', cols: [1,2,3,4,5,6],
        subHeaders: ['序列号', '门店', '设备型号', 'VIN', '不含税采购价', '性质'] },
      { label: '布里斯班 Brisbane', color: 'brisbane', cols: [8,9,10,11,12,13],
        subHeaders: ['序列号', '门店', '设备型号', 'VIN', '不含税采购价', '性质'] },
      { label: '珀斯 Perth', color: 'perth', cols: [15,16,17,18,19,20],
        subHeaders: ['序列号', '门店', '设备型号', 'VIN', '不含税采购价', '性质'] },
    ],
    hideCols: [7,14],
    labelCols: [1,2,3,4,6,8,9,10,11,13,15,16,17,18,20],
    moneyCols: [5,12,19],
  },

  // ===== 门店租赁单据统计 (vertical) =====
  '门店租赁单据统计': {
    headerRows: 1, dataStartRow: 2,
    useRow1AsHeader: true,
    clearSeedData: true,                    // 清空 4 月种子数据,只保留表头
    columnNames: {
      1:'序号', 2:'月份', 3:'门店', 4:'对应报价单', 5:'机器型号', 6:'VIN',
      7:'销售', 8:'租期', 9:'租赁起始时间', 10:'最新进销存发票', 11:'状态',
      12:'到期日', 13:'月租金', 14:'已收金额'
    },
    hideCols: [15,16,17,18,19,20,21,22],   // 隐藏 剩余金额/备注/附加1-6
    dateCols: [9,12],
    labelCols: [4,5,6,7,8,10,11],
    moneyCols: [13,14],
    autoSerialCol: 1,                       // 序号自动 1,2,3...
    autoMonthCol: 2,                        // 月份自动 = 当前月份
    dropdowns: { 3: ['悉尼','布里斯班','珀斯'] },
    addRowButton: true,                     // 显示 ➕ 在数据末尾插行
    footer: {                                // 底部合计行
      cells: {
        4: { label: '本月统计', kind:'label' },                       // "本月统计" 放在 对应报价单 列
        13: { kind:'auto', formula:'countNonEmpty', sourceCol:4, label:'本月销售单数' },  // 统计开了多少单
        14: { kind:'input', label:'超3月单据数', placeholder:'手填' }
      }
    },
    storeFilterCol: 3,
  },

};
