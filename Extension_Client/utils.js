// Helper function to wait for an element to appear
async function waitForElement(selector, timeout = 10000, interval = 250) {
    const startTime = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                resolve(null);
            } else {
                setTimeout(check, interval);
            }
        };
        check();
    });
}

// Helper function to click an element reliably
async function clickElement(element) {
    if (element) {
        element.click();
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay after click
        return true;
    }
    return false;
}
