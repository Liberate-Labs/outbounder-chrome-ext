let json = {};

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const tabUrl = tab.url;
    let result;

    try {
        [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => document.documentElement.innerHTML,
        });
    } catch (e) {
        return;
    }

    const titleRegex = /<title>(.*?)\| LinkedIn<\/title>/i;
    const titleMatch = result.match(titleRegex);

    const descriptionRegex =
        /class="artdeco-entity-lockup__subtitle ember-view truncate">([^<]+)<\/div>/;
    const descriptionMatch = result.match(descriptionRegex);

    const currentCompanyRegex = /Current company:\s*(.*?)\s*. Click/i;
    const currentCompanyMatch = result.match(currentCompanyRegex);

    const pageTitle = document.getElementById("page-title");
    const description = document.querySelector(".description");
    const currentCompany = document.getElementById("current-company");

    const companyLogoRegex =
        /<a data-field="experience_company_logo"[^>]*href="([^"]*)"/i;
    const companyLogoMatch = result.match(companyLogoRegex);
    let companyLogoLink = "";
    if (companyLogoMatch) {
        companyLogoLink = companyLogoMatch[1] + "about/";
    }

    if (titleMatch && pageTitle) {
        pageTitle.textContent = titleMatch[1];
    }

    if (descriptionMatch && description) {
        description.textContent = descriptionMatch[1];
    }

    if (currentCompanyMatch && currentCompany) {
        currentCompany.textContent = currentCompanyMatch[1];
    }

    // processAndSendData(result, tabUrl);
    json["result"] = result;

    const recentActivityUrl = tabUrl + "recent-activity/all/";
    chrome.scripting.executeScript(
        {
            target: { tabId: tab.id },
            function: (recentActivityUrl) => {
                window.location.href = recentActivityUrl;
            },
            args: [recentActivityUrl],
        },
        () => {
            setTimeout(() => {
                scrollPage(tab.id, 16, () => {
                    extractDataFromRecentActivityPage(tab.id, recentActivityUrl, () => {
                        chrome.scripting.executeScript(
                            {
                                target: { tabId: tab.id },
                                function: (companyLogoLink) => {
                                    window.location.href = companyLogoLink;
                                },
                                args: [companyLogoLink],
                            },
                            () => {
                                console.log("Navigated to companyLogoLink");

                                setTimeout(() => {
                                    extractDataFromCompanyLogoPage(tab.id, companyLogoLink);
                                }, 2000);
                            }
                        );
                    });
                });
            }, 5000);
        }
    );
});

function extractDataFromCompanyLogoPage(tabId, url) {
    chrome.scripting.executeScript(
        {
            target: { tabId: tabId },
            function: () => document.documentElement.innerHTML,
        },
        async (results) => {
            try {
                const resultCompanyLogo = results[0].result;
                json["resultCompanyLogo"] = resultCompanyLogo;
                console.log("resultCompanyLogo");
                const linkRegex = /<span class="link-without-visited-state" dir="ltr">(.*?)<\/span>/;
                const linkMatch = resultCompanyLogo.match(linkRegex);
                console.log("LinkMatch", linkMatch);
                if (linkMatch) {
                    const websiteLink = linkMatch[1];
                    console.log(websiteLink);
                    chrome.scripting.executeScript(
                        {
                            target: { tabId: tab.id },
                            function: (websiteLink) => {
                                window.location.href = websiteLink;
                            },
                            args: [websiteLink],
                        },
                        () => {
                            console.log("Navigated to companyWebsite");

                            extractDataFromCompanyWebsite(tab.id, websiteLink);

                        }
                    );
                    extractDataFromCompanyWebsite(tabId, websiteLink)
                }

            } catch (e) {
                console.log(e);
            }
        }
    );
}

function extractDataFromCompanyWebsite(tabId, url) {
    chrome.scripting.executeScript(
        {
            target: { tabId: tabId },
            function: () => document.documentElement.innerHTML,
        },
        async (results) => {
            try {
                const resultCompanyWebsite = results[0].result;
                json["resultCompanyWebsite"] = resultCompanyWebsite;
                processAndSendData(json, url);
            } catch (e) {
                console.log(e);
            }
        }
    );
}

async function processAndSendData(data, url) {
    console.log(data, url);

    try {
        const res = await fetch("http://localhost:8000/receive-data", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ data: data }),
        });

        const resData = await res.json();

        console.log(resData);
    } catch (error) {
        console.log(error);
    }
}

function scrollPage(tabId, numberOfScrolls, callback) {
    let scrollCount = 0;

    function scroll() {
        if (scrollCount < numberOfScrolls) {
            chrome.scripting.executeScript(
                {
                    target: { tabId: tabId },
                    function: () => {
                        window.scrollBy(0, window.innerHeight);
                    },
                },
                () => {
                    setTimeout(scroll, 50);
                }
            );
            scrollCount++;
        } else {
            callback();
        }
    }

    scroll();
}

function extractDataFromRecentActivityPage(tabId, url, callback) {
    chrome.scripting.executeScript(
        {
            target: { tabId: tabId },
            function: () => document.documentElement.innerHTML,
        },
        async (results) => {
            try {
                const resultRecentActivity = results[0].result;
                const spanCount = (
                    resultRecentActivity.match(/<span><span dir="ltr">/g) || []
                ).length;

                const countElement = document.getElementById("count");
                if (countElement) {
                    countElement.textContent = spanCount;
                }

                // processAndSendData(resultRecentActivity, url);
                json["resultRecentActivity"] = resultRecentActivity;
                callback();
            } catch (e) {
                console.log(e);
            }
        }
    );
}

