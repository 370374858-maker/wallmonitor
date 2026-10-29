const isBlank = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

   
                                                                         
                                                                                   
   
export function fillMeasurementAverage(values, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const original = Array.isArray(values) ? [...values] : [];
  if (original.length !== 6) {
    return {
      status: 'invalid', changed: false, values: original, average: null, filledIndices: [],
      invalidIndices: [], message: '混凝土面测量必须包含六个测点。'
    };
  }

  const invalidIndices = [];
  const validValues = [];
  const blankIndices = [];
  original.forEach((value, index) => {
    if (isBlank(value)) {
      blankIndices.push(index);
      return;
    }
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    const hasSupportedPrecision = Number.isFinite(number) &&
      Math.abs(number * 10000 - Math.round(number * 10000)) <= 0.00001;
    if (!hasSupportedPrecision || number < min || number > max) invalidIndices.push(index);
    else validValues.push(number);
  });

  if (invalidIndices.length) {
    const labels = invalidIndices.map(index => String.fromCharCode(65 + index)).join('、');
    return {
      status: 'invalid', changed: false, values: original, average: null, filledIndices: [], invalidIndices,
      message: `测点 ${labels} 不是 ${min}～${max} m 范围内的有效数据，请先更正。`
    };
  }
  if (!blankIndices.length) {
    return {
      status: 'complete', changed: false, values: original, average: null, filledIndices: [], invalidIndices: [],
      message: '六个测点均已填写，无需快捷输入。'
    };
  }
  if (!validValues.length) {
    return {
      status: 'empty', changed: false, values: original, average: null, filledIndices: [], invalidIndices: [],
      message: '请先填写至少一个有效测点数据。'
    };
  }

  const average = Number((validValues.reduce((sum, value) => sum + value, 0) / validValues.length).toFixed(2));
  const fillText = average.toFixed(2);
  const blankSet = new Set(blankIndices);
  return {
    status: 'filled', changed: true,
    values: original.map((value, index) => blankSet.has(index) ? fillText : value),
    average, filledIndices: blankIndices, invalidIndices: [],
    message: `已用现有数据平均值 ${fillText} m 填入 ${blankIndices.length} 个空白测点。`
  };
}
