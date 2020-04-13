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
  console.log('Nueva sesión', new Date())

  try {
    const browser = await scraper.startBrowser({ development: true })

    const page = await scraper.getPage(browser)

    // Inspecciona respuestas para buscar el nombre del archivo a descargar
    const downloadsInProgress = []
    page.on('response', async res => {
      if (res.url().endsWith('consultaPublica.xhtml')) {
        const headers = res.headers()
        if (headers['content-type'] === 'application/vnd.ms-excel') {
          // Si pedimos un excel, checar el nombre
          const match = headers['content-disposition'].match(/filename\="(.*)"/) || []
          const filename = match[1]
          console.log('Descargando', filename)

          // Marcamos la descarga como pendiente
          downloadsInProgress.push(scraper.toDownload(filename))
        }
      }
    })

    await page.goto(startUrl + '#inicio')
    await scraper.navigateToOrganizations(page)

    if (organization) {
      await scraper.getContract(page, organization)
    } else {
      for (let i = from; i <= to; i++) {
        console.log('Trabajando en la organización', i)
        try {
          const res = await scraper.getContract(page, null, i)
          if (res) {
            // Esperamos a que las descargas terminen
            await Promise.all(downloadsInProgress)
            // Vamos de regreso
            await page.goto(startUrl + '#obligaciones')
          }

          await page.goto(startUrl + '#sujetosObligados')
        } catch (e) {
          // Nos lo brincamos si falla
          console.log(e)
          console.log(`La organización ${i} no se pudo escrapear; brincando...`)
          await page.goto(startUrl + '#obligaciones')
          await page.goto(startUrl + '#sujetosObligados')
          continue
        }
      }
    }

    await browser.close()
    console.log('Terminamos el scraping')
  } catch (e) {
    console.log('Algo falló')
    throw e
  }
})()
