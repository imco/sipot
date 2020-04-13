#!/usr/bin/env node
// usage: cli.js --organization "Secretaría de Cultura"

const argv = require('minimist')(process.argv.slice(2))
const scraper = require('./scraper')

const organization = argv.organization

;(async () => {
  try {
    const browser = await scraper.startBrowser({ development: true })
    const page = await scraper.getPage(browser)
    await scraper.getContract(page, organization)
    await browser.close()
    console.log('Terminamos el scraping')
  } catch (e) {
    console.log('Algo falló')
    throw e
  }
})()
