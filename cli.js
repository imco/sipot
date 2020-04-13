#!/usr/bin/env node
// usage: cli.js --organization "Secretaría de Cultura"

const argv = require('minimist')(process.argv.slice(2))
const scraper = require('./scraper')

const organization = argv.organization
const from = Number(argv.from || 0)
// TODO: encontrar este número dinámicamente
const to = Number(argv.to || 965)

const startUrl = 'https://consultapublicamx.inai.org.mx/vut-web/faces/view/consultaPublica.xhtml'

;(async () => {
  try {
    const browser = await scraper.startBrowser({ development: true })

    const page = await scraper.getPage(browser)
    await page.goto(startUrl + '#inicio')
    await scraper.navigateToOrganizations(page)

    if (organization) {
      await scraper.getContract(page, organization)
    } else {
      for (let i = from; from <= to; i++) {
        console.log('Trabajando en la organización', i)
        await scraper.getContract(page, null, i)
        await page.goto(startUrl + '#obligaciones')
        await page.goto(startUrl + '#sujetosObligados')
      }
    }

    await browser.close()
    console.log('Terminamos el scraping')
  } catch (e) {
    console.log('Algo falló')
    throw e
  }
})()
