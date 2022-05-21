// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const fs = require('fs')
const { promisify } = require('util')
const exists = promisify(fs.stat)
const path = require('path')
const { Console } = require('console')

let didReload = false
const downloadsInProgress = []
const fromTargetUrl = res => res.url().endsWith('consultaPublica.xhtml')
const hasDisplay = 'contains(@style, "display: block")'
const sequence = [
  'inicio',
  'sujetosObligados',
  'obligaciones',
  'tarjetaInformativa'
]

/**
 * Navega en reversa el sitio.
 * Por ejemplo si queremos regresar de las descargas de una org
 * al listado de organizaciones.
 * @param {Page} page
 * @param {string} nextLocation
 */
async function backTo (page, nextLocation) {
  const url = page.url()
  console.log('Actualmente estoy en', url.split('/').slice(-1)[0])
  const [base, target] = url.split('#')

  // Nota: target es el # actual
  const nextLocationIndex = sequence.indexOf(nextLocation)
  const targetIndex = sequence.indexOf(target)

  // Si la ubicación deseada (nextLocation) es la misma o enfrente
  // salimos del método
  if (nextLocationIndex - targetIndex >= 0) {
    console.log('Ya estamos en la ubicación deseada')
    return true
  }

  const navigationSteps = sequence
    .slice(nextLocationIndex, targetIndex)
    .reverse()

  console.log('Navegando', navigationSteps.join('->'))
  for (let i in navigationSteps) {
    await page.goto(`${base}#${navigationSteps[i]}`)
  }
}

async function takeTo (page, nextLocation, stateCode, params) {
  const { organizationName, organizationIndex, year } = params

  const url = page.url()
  console.log('Actualmente estoy en', url.split('/').slice(-1)[0])
  const [base, target] = url.split('#')

  // Nota: target es el # actual
  const nextLocationIndex = sequence.indexOf(nextLocation)
  const targetIndex = sequence.indexOf(target)

  if (nextLocationIndex - targetIndex <= 0) {
    return await backTo(page, nextLocation)
  }

  // Pa' delante (sin contar el inicio)
  const steps = sequence.slice(targetIndex + 1, nextLocationIndex + 1)

  for (let i in steps) {
    const step = steps[i]
    console.log(`navegando a #${step}`)
    switch (step) {
      case 'sujetosObligados':
        await navigateToOrganizations(page, stateCode)
        break
      case 'obligaciones':
        await navigateToObligations(page, organizationName, organizationIndex)
        break
      case 'tarjetaInformativa':
        await navigateToInformationCard(page, year)
        break
    }
  }
}

/**
 * Consigue el archivo Excel de contratos para una organization
 * @param {Object} page de Puppeteer.Page
 * @param {String} organizationName se puede usar nombre ('Secretaría de Educación Pública (SEP)')
 * @param {Number} organizationIndex o se puede usar índice (42)
 * @param {Number} year
 */
async function getContract (page, organizationName = null, organizationIndex = 0, year = 2021, type) {
  let selection
  if (type === 1) {
      selection = "Procedimientos de adjudicación directa"
  } else {
      selection = "Procedimientos de licitación pública e invitación a cuando menos tres personas"
  }
  // Espera a que carge la página de documentos
  await page.waitForXPath('//div[@id="formListaFormatos:listaSelectorFormatos"]')
  const typeCheckbox = await page.$x('//label[contains(@class, "containerCheck")]')
  if (typeCheckbox.length) {
      let found = false
      for (let option of typeCheckbox) {
          let text = await page.evaluate(el => el.innerText, option);
          if (text == selection) {
            await option.click()
            found = true
            break
          } 
      }
      if (found === false) {
          const msg = `Opción '${selection}' no encontrada para ${organizationName}; brincando...`
          console.log(msg)
          throw new Error(msg)
      }
  } else {  
      // Algunas instituciones no tienen este selector, porque solamente están disponibles descargas para Procedimientos de adjudicación directa
      if (!type) {
        const msg = `No se encontraron contratos del tipo '${selection}' para ${organizationName}; brincando...`
        console.log(msg)
        throw new Error(msg)
      }
  }

  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })

  // Selecciona todos en Periodo de actualización
  const periodsCheckboxes = await page.$x('//label[contains(@for, "formInformacionNormativa:checkPeriodos")]')
  let foundPeriods = false
  for (let option of periodsCheckboxes) {
      let text = await page.evaluate(el => el.innerText, option);
      if (text == "Seleccionar todos") {
        await option.click()
        foundPeriods = true
        break
      } 
  }
  console.log('Seleccionamos todos los periodos de actualización')

  // Consultar
  const queryButton = await page.$x('//a[contains(text(), "CONSULTAR")]')
  await queryButton[0].click()

  // Scroll up
  await page.evaluate(_ => {
    window.scrollTo(0, 400)
  })

  // Espera a que el bloqueo de pantalla de la consulta se quite
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })
  await page.waitForTimeout(1000)

  // Si no hay resultados nos brincamos la organización
  const downloadCounter = await page.$x('//span[contains(text(), "Se encontraron")]/..')
  const counterText = await downloadCounter[0].evaluate(node => node.innerText)
  const match = counterText.match(/Se encontraron (\d+) resultados/) || []
  const count = Number(match[1])
  console.log(`Se encontraron ${count} resultados en la consulta`)
  if (count === 0) return false

  // Seleccionar opción de descargar
  const downloadButton = await page.waitForXPath('//a[contains(text(), "DESCARGAR")]')
  await downloadButton.click()

  // Seleccionar opción de descargar en la modal
  const downloadLabel = await page.waitForXPath('//label[contains(text(), "Descargar")]')

  try {
    await downloadLabel.click()
  } catch (e) {
    throw new Error('No se encontró el botón de descarga en el modal')
  }

  // Para hacer click en el dropdown menu en cada iteración
  const dropdown = await page.waitForXPath('//button[@data-id="formModalRangos:rangoExcel"]')

  // Espera a que cargue el rango de formatos
  // y obtiene las opciones
  await page.waitForXPath('//select[@id="formModalRangos:rangoExcel"]')
  const options = await page.$x('//select[@id="formModalRangos:rangoExcel"]/option')

  // Descargar cada opcion disponible
  for (let i in options) {
    const [text, value] = await options[i].evaluate(node => [node.text, node.value])
    console.log('Opción encontrada:', text, value)

    // Excepto el primer elemento que dice "Seleccionar" cuyo valor es -1
    if (value === '-1') continue

    // Selecciona esta opción del rango
    await dropdown.click()

    const optionSpan = await page.$x(`//a/span[contains(text(), "${text}")]`)
    await optionSpan[0].click()

    // Descarga archivo Excel
    const downloadExcel = await page.waitForXPath('//input[@id="formModalRangos:btnDescargaExcel"]')
    await downloadExcel.click()

    console.log('Rango seleccionado')

    // Esperamos 90s a que el servidor responda a nuestra petición de descarga
    // El listener <responseHandler> agregará el archivo a la lista
    // de descargas pendientes, y esperaremos a que terminen antes de continuar.
    const downloadRequest = await page.waitForResponse(async r => {
      return fromTargetUrl(r) && r.status() === 200
    }, { timeout: 90000 })

    if (!downloadRequest.ok()) {
      console.log('No contestó el servidor con éxito')
      return false
    };

    if (didReload === true) {
      // Algunas organizaciones no se pueden descargar, más que por email
      // entonces la página reinicia y muestra un modal

      const sizePopup = await page.waitForXPath(`//div[@id="modalAvisoError" and ${hasDisplay}]`)
      if (sizePopup) {
        const errorDiv = await page.$x(`//div[@id="modalAvisoError"]`)
        const errorMsg = await errorDiv[0].evaluate(node => node.innerText)
        console.log(errorMsg.trim().split('.')[0])
      }
      const continuar = await page.waitForSelector('#modalCSV > div > div > div > div:nth-child(2) > div > button')
      await continuar.evaluate(b => b.click())

      const cerrar = await page.waitForSelector('#modalAvisoError > div > div > div > div:nth-child(2) > div > button')
      await cerrar.evaluate(b => b.click())

      // Resetear la variable
      didReload = false

      return true
    }

    await page.waitForTimeout(1000)
    await Promise.all(downloadsInProgress)
  }

  // Wait again for any remaining download to get to the queue (esp. the last one)
  await page.waitForTimeout(1000)
  await Promise.all(downloadsInProgress)

  // Quita la ventana modal
  const modal = await page.waitForSelector('#modalRangos')
  await modal.evaluate(b => b.click())
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })

  return true
}

/**
 * Inspecciona respuestas para buscar el nombre del archivo a descargar
 * Agrega también una {Promise} de descarga (ver toDownload) a la
 * lista global de descargas pendientes.
 * @params {Response) res
 * @params {string} dest_dir
 * @return {string|null} filename
 */
function responseHandler (res, dest_dir) {
  if (fromTargetUrl(res)) {
    const headers = res.headers()
    // Si es un excel, registramos el nombre y monitoreamos la descarga
    if (headers['content-type'] === 'application/vnd.ms-excel') {
      didReload = false
      // Si pedimos un excel, checar el nombre
      const match = headers['content-disposition'].match(/filename\="(.*)"/) || []
      const filename = match[1]
      console.log('Descargando', filename)

      // Marcamos la descarga como pendiente
      downloadsInProgress.push(toDownload(filename, dest_dir))

      return filename
    } else if (((headers['cache-control'] || '') != 'no-cache') && ((headers['content-length'] || '0') === '0') && ((headers['set-cookie'] || '').endsWith('path=/'))) {
      didReload = true
    }
  }

  return null
}

/**
 * Prepara la configuración común de la página a escrapear
 * @param {Object} puppeeter.Browser
 * @param {Object} opts
 * @returns {Object} puppeeter.Page
 */
async function getPage (browser, opts) {
  const page = await browser.newPage()
  const timeout = opts.timeout || 60000
  const dest_dir = opts.downloads_dir

  // Descarga archivos en la carpeta local
  await page._client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dest_dir
  })

  await page.setRequestInterception(true)
  page.on('request', interceptedRequest => {
    // No tiene caso desperdiciar ancho de banda en imágenes
    if (['.jpg', '.png', '.svg'].some(ext => interceptedRequest.url().endsWith(ext))) {
      interceptedRequest.abort()
    } else {
      interceptedRequest.continue()
    }
  })

  await page.setViewport({ width: 1800, height: 1000 })
  page.setDefaultTimeout(timeout)

  page.on('response', (response) => responseHandler(response, dest_dir))

  return page
}

/**
 * Getting from #inicio to #sujetosObligados
 */
async function navigateToOrganizations (page, stateCode) {
  // Click en el filtro "Estado o Federación"
  const filter = await page.waitForSelector('#filaSelectEF > div.col-md-4 > div > button > span.filter-option.pull-left')
  await filter.click()

  // Selecciona el estado dropdown (Default: segundo elemento del dropdown: "Federación")
  const fed = await page.waitForSelector(`#filaSelectEF > div.col-md-4 > div > div > ul > li:nth-child(${stateCode + 1}) > a`)
  await fed.click()
}

/**
 * Selecciona del dropdown la organización
 * @param {Page} page
 * @param {string} orgId
 */
async function selectNextOrganization (page, orgId) {
  const dropdownButton = await page.$x('//button[@data-id="formEntidadFederativa:cboSujetoObligado"]')
  if (dropdownButton.length) {
    await dropdownButton[0].click()
    const dropdownOrg = await page.waitForXPath(`//a/span[normalize-space(text())='${orgId}']`)
    if (!dropdownOrg) {
      console.log('Organización no encontrada en dropdown', orgId)
    } else {
      console.log('Seleccionando del dropdown a', orgId)
      await dropdownOrg.click()
      await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })
    }
  } else {
    console.log('No encontramos el dropdown de organizaciones')
  }
}

/**
 * Getting from #sujetosObligados to #obligaciones
 */
async function navigateToObligations (page, organizationName = null, organizationIndex = 0) {

  // Seleccionamos la institución desde el dropdown
  const institutionDropdown = await page.waitForSelector('#tooltipInst > div > button')
  await institutionDropdown.click()

  console.log('Objetivo:', organizationName)

  // Hacemos click en la organización de interés
  const dropdownOrg = await page.$x(`//a/span[normalize-space(text())='${organizationName}']`)
  if (!dropdownOrg.length) {
    const msg = `No encontramos la institución '${organizationName}' en el dropdown`
    console.log(msg)
    throw new Error(msg)
  } else if (dropdownOrg.length == 1) {
    await dropdownOrg[0].click()
  } else {
    await dropdownOrg[1].click()
  }
}

/**
 * Getting from #obligaciones to #tarjetaInformativa
 */
async function navigateToInformationCard (page, year = 2021) {
  await page.waitForXPath('//form[@id="formListaObligaciones"]')

  // Espera a que el bloqueo de pantalla de la consulta se quite
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })

  // Algunas organizaciones no tendrán sección de contratos
  let contractsLabel = []

  // Otras muestran un popup, así que hay que asegurarnos de cerrarlo
  const noContractsPopup = await page.$x(`//div[@id="modalSinObligaciones" and ${hasDisplay}]`)

  if (noContractsPopup.length) {
    await noContractsPopup[0].click()
  } else {
    // Ahora queremos cargar la sección de "CONTRATOS DE OBRAS, BIENES, Y SERVICIOS".
    // El elemento a clickear tiene un id con una terminación numérica que
    // no se repite entre renders.
    // Es por esto que vamos a buscar el label con la etiqueta CONTRATOS DE OBRAS...
    // y luego obtener una referencia al ancestro que sí es clickeable.
    await page.waitForXPath('//div[@class="tituloObligacion"]')
    contractsLabel = await page.$x('//label[contains(text(), "CONTRATOS DE OBRAS, BIENES Y SERVICIOS")]')
  }

  if (!contractsLabel.length) {
    const msg = 'No hay contratos para esta organización'
    console.log(msg)
    throw new Error(msg)
  } else {
    await contractsLabel[0].click()

    // Selecciona el año del dropdown
    const period = await page.waitForXPath('//select[@id="formEntidadFederativa:cboEjercicio"]')
    const selection = await (await period.getProperty("value")).jsonValue();
    if (selection != year) {
        await period.select(String(year))
        console.log('Seleccionamos el año', year)

        // Hacer clic en "CONTRATOS DE OBRAS, BIENES, Y SERVICIOS" de nuevo
        await page.waitForXPath('//div[@class="tituloObligacion"]')
        contractsLabel = await page.$x('//label[contains(text(), "CONTRATOS DE OBRAS, BIENES Y SERVICIOS")]')
        await contractsLabel[0].click()
    } 
  }
}

async function startBrowser (params) {
  let options = params || {}
  if (options.development) {
    options = {
    //   devtools: true,
      headless: false,
      ignoreHTTPSErrors: true,
      slowMo: 250,
      args: [
        "--no-sandbox",
        "--no-zygote",
        "--single-process",
        "--window-position=000,000"
      ]
    }
  }

  const browser = await puppeteer.launch(options)
  return browser
}

function toDownload (filename, dest_dir, timeoutSeconds = 60, intervalSeconds = 1) {
  return new Promise((resolve, reject) => {
    let interval
    let timeout
    const filepath = path.join(dest_dir, filename)

    timeout = setTimeout(() => {
      clearInterval(interval)
      const error = `No hemos podido descargar ${filename} en menos de 60s`
      console.log(error)
      return reject(error)
    }, timeoutSeconds * 1000)

    interval = setInterval(async () => {
      try {
        await exists(filepath)
        clearTimeout(timeout)
        clearInterval(interval)

        const success = `Se ha descargado ${filename}`
        console.log(success)
        return resolve(success)
      } catch (e) {
        console.log(filepath, 'aun no existe')
      }
    }, intervalSeconds * 1000)
  })
}

module.exports = {
  backTo,
  downloadsInProgress,
  getContract,
  getPage,
  navigateToOrganizations,
  selectNextOrganization,
  startBrowser,
  takeTo,
  toDownload
}
