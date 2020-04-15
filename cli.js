#!/usr/bin/env node
// usage: cli.js --organization "Secretaría de Cultura"
// usage: cli.js --organizationList obligados.json
// usage: cli.js --from 10 --to 12

const argv = require('minimist')(process.argv.slice(2))
const fs = require('fs')
const path = require('path')
const scraper = require('./scraper')

const { promisify } = require('util')

const organization = argv.organization
const organizationList = argv.organizationList
const from = Number(argv.from || 0)
// TODO: encontrar este número dinámicamente
const to = Number(argv.to || 965)
const year = argv.year

const startUrl = 'https://consultapublicamx.inai.org.mx/vut-web/faces/view/consultaPublica.xhtml'

;(async () => {
  console.log('Nueva sesión', new Date())

  let organizations
  if (organizationList) {
    const read = promisify(fs.readFile)
    const orgData = await read(organizationList)
    organizations = JSON.parse(orgData.toString())
    console.log(`Se encontraron ${organizations.length} organizaciones en ${organizationList}`)
  }

  try {
    const browser = await scraper.startBrowser({ development: !!argv.development })

    const page = await scraper.getPage(browser)

    await page.goto(startUrl + '#inicio')
    await scraper.navigateToOrganizations(page)

    if (organization) {
      await scraper.getContract(page, organization, null, year)
      await browser.close()
      return true
    }

    // Prepara parametros para el loop de scraping
    // Iteramos una lista de organizaciones
    // o una secuencia ascendente
    let parameters = []
    if (organizations) {
      parameters = organizations.map(o => [o, null])
    } else {
      parameters = new Array(to - from + 1).fill(0)
        .map((_, i) => [null, from + i])
    }

    for (let i in parameters) {
      const invocationParams = parameters[i]
      const orgId = invocationParams[0] || invocationParams[1]
      console.log('Trabajando en la organización', orgId)
      try {
        const res = await scraper.getContract(page, ...invocationParams, year)
      } catch (e) {
        // Nos lo brincamos si falla
        console.log(e)
        console.log(`La organización ${orgId} no se pudo escrapear; brincando...`)
      }

      await scraper.backTo(page, 'sujetosObligados')
    }

    // Por si quedan algunas descargas pendientes
    await Promise.all(scraper.downloadsInProgress)

    await browser.close()

    console.log('Se descargaron %i archivos', scraper.downloadsInProgress.length)
    console.log('Terminamos el scraping')
  } catch (e) {
    console.log('Algo falló')
    throw e
  }
})()
