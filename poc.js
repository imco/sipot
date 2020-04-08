const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 })
  const page = await browser.newPage()

  await page.goto('https://consultapublicamx.inai.org.mx/vut-web/faces/view/consultaPublica.xhtml#inicio')
  await page.setViewport({ width: 1280, height: 800 })

  // Click en el filtro "Estado o Federación"
  await page.waitForSelector('#filaSelectEF > .col-md-4 > .btn-group > .btn > .filter-option')
  await page.click('#filaSelectEF > .col-md-4 > .btn-group > .btn > .filter-option')

  // Selecciona el segundo elemento del dropdown: "Federación"
  await page.waitForSelector('.btn-group > .dropdown-menu > .dropdown-menu > li:nth-child(2) > a')
  await page.click('.btn-group > .dropdown-menu > .dropdown-menu > li:nth-child(2) > a')

  // La página se divide en menús colapsables por letra del abecedario
  await page.waitForSelector('.botonActiva')
  const alphaSections = await page.$$('.botonActiva')

  // Hacemos click en la número 17 (S)
  const section = await alphaSections[16]
  const letter = await section.$('.indiceListaSO', node => node.innerText)
  section.click()

  // Se abre el menú y seleccionamos la SEP (44 de la lista)
  const orgElements = await section.$$('li.sOFiltrable input')
  await orgElements[43].click()

  // Ahora queremos cargar la sección de "CONTRATOS DE OBRAS, BIENES, Y SERVICIOS".
  // El elemento a clickear tiene un id con una terminación numérica que
  // no se repite entre renders.
  // Es por esto que vamos a buscar el label con la etiqueta CONTRATOS DE OBRAS...
  // y luego obtener una referencia al ancestro que sí es clickeable.
  await page.waitForXPath('//form[@id="formListaObligaciones"]')
  await page.waitForXPath('//div[@class="tituloObligacion"]')
  const contractsLabelPath = '//label[contains(text(), "CONTRATOS DE OBRAS, BIENES Y SERVICIOS")]'
  const contractsLabel = await page.$x(contractsLabelPath)
  if (contractsLabel.length) {
    const contractsElement = await contractsLabel[0].$x('./../../../..')
    if (contractsElement.length) {
      await contractsElement[0].click()
    }
  } else {
    console.log('No se encontró sección de contratos')
  }

  // Espera a que carge la página de documentos
  await page.waitForXPath('//div[@id="formListaFormatos:listaSelectorFormatos"]')

  // Selecciona todos en Periodo de actualización
  const checkboxPath = '//input[@id="formInformacionNormativa:checkPeriodos:4"]'
  const checkbox = await page.$x(checkboxPath)
  await checkbox[0].click()

  // Consultar
  const queryButton = await page.$x('//a[contains(text(), "CONSULTAR")]')
  await queryButton[0].click()

  // Espera a la ventana emergente
  // TODO: identificar con un DOMElement que la consulta termina
  await page.waitFor(5000)

  // Seleccionar opción de descargar
  const downloadButton = await page.$x('//a[contains(text(), "DESCARGAR")]')
  await downloadButton[0].click()

  await page.waitFor(500)

  // Seleccionar opción de descargar en la modal
  const downloadLabel = await page.$x('//label[contains(text(), "Descargar")]')
  await downloadLabel[0].click()

  // Espera a que cargue el rango de formatos
  await page.waitForXPath('//select[@id="formModalRangos:rangoExcel"]')
  const options = await page.$x('//select[@id="formModalRangos:rangoExcel"]/option')

  for (let i in options) {
    const [text, value] = await options[i].evaluate(node => [node.text, node.value])
    console.log('found option:', text, value)
  }

  await browser.close()
})()
