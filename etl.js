#!/usr/bin/env node

const argv = require('minimist')(process.argv.slice(2))
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { promisify } = require('util')
const XLSX = require('xlsx')

const DELIMITER = ';'
const dir = path.join(process.cwd(), argv.directory || '')
const op = argv.op || 'index'
const cores = argv.cores || 4

function getMetadataForFile (filepath) {
  const quote = s => `"${s}"`
  const formatCellValue = (v = '') => quote(v.trim().replace(':', ''))

  let workbook = XLSX.readFile(filepath)
  // A veces "Informacion" otras "Información" pero siempre la primera
  const infoSheetName = workbook.SheetNames[0]
  const infoSheet = workbook.Sheets[infoSheetName]

  // Los XLSX enviados por correo traen otras 2 columnas en B y C que tenemos que saltar
  const cells = filepath.endsWith('.xlsx')
    ? ['B1', 'B2', 'B3', 'B4', 'D7']
    : ['B1', 'B2', 'B3', 'B4', 'B7']

  const metadata = cells
    .map(cellId => formatCellValue((infoSheet[cellId] || {}).v))

  return metadata
}

/**
 * Create downloads index, output to stdout in CSV format
 * @param {array} xls filenames
 */
function index (xls) {
  const headers = [
    'Nombre del Sujeto Obligado',
    'Normativa',
    'Formato',
    'Periodos',
    'Ejercicio',
    'Archivo'
  ]

  console.log(headers.join(DELIMITER))

  for (let filename of xls) {
    const filepath = path.join(dir, filename)
    const metadata = getMetadataForFile(filepath)
    metadata.push(filename)
    console.log(metadata.join(DELIMITER))
  }
}

/**
 * Merge all xls* files from a directory into one large CSV
 */
function merge () {
  const outname = `./${Date.now()}.csv`
  const out = fs.openSync(outname, 'a')
  const err = fs.openSync(outname.replace('csv', 'err'), 'a')
  const pipeline = [
    `ls -1 ${path.join(dir, '*.xls*')}`,
    `xargs -P ${cores} -I {} in2csv {}`
  ].join(' | ')

  console.log('Ejecutando', pipeline)
  console.log('Escribiendo a', outname)
  spawn('sh', ['-c', pipeline], { stdio: ['ignore', out, err] })
}

;(async () => {
  const readdir = promisify(fs.readdir)
  const files = await readdir(dir)
  const xls = files.filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'))

  if (op === 'index') {
    index(xls)
  } else if (op === 'merge') {
    merge()
  } else {
    console.log('uso: ./etl.js --op [index|merge] --directory <directory> --cores [4]')
  }
})()
