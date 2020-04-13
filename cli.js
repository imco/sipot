#!/usr/bin/env node
// usage: cli.js --organization "Secretaría de Cultura"

const argv = require('minimist')(process.argv.slice(2))
const contracts = require('./contracts')

const organization = argv.organization

;(async () => {
  try {
    await contracts.getContract(organization)
    console.log('Terminamos el scraping')
  } catch (e) {
    console.log('Algo falló')
    throw e
  }
})()
