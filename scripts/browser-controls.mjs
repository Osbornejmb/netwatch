// Shared interaction with controls intentionally tucked away in View options.
export async function openView(page) {
 const details=page.locator('.health-view-options')
 if(!await details.evaluate(el=>el.open))await details.locator(':scope > summary').click()
}
export async function setSource(page,source) {
 const details=page.locator('.health-view-options'),wasOpen=await details.evaluate(el=>el.open)
 await openView(page);await page.getByLabel('Network source').selectOption(source)
 if(!wasOpen)await details.locator(':scope > summary').click()
}
export async function refreshNetwork(page) {
 const details=page.locator('.health-view-options'),wasOpen=await details.evaluate(el=>el.open)
 await openView(page);await page.getByRole('button',{name:'Refresh now',exact:true}).click()
 if(!wasOpen)await details.locator(':scope > summary').click()
}
