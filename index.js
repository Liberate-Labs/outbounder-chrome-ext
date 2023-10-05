document.getElementById('startScrapingButton').addEventListener('click', startScraping);
document.getElementById('showPreviousButton').addEventListener('click', previousData);
let prevData = {};
function showData() {
  document.getElementById('startScrapingButton').style.display = 'none';
  document.getElementById('showPreviousButton').style.display = 'none';
  document.getElementById('scrapper').style.display = 'block';
  const avatarImage = document.querySelector(".avatar");
  const pageTitle = document.getElementById("page-title");
  const description = document.querySelector(".description");
  const currentCompany = document.getElementById("current-company");
  const checkData = localStorage.getItem("prevData");
  const prevData = JSON.parse(checkData);

  pageTitle.textContent = prevData.title;
  description.textContent = prevData.description;
  currentCompany.textContent = prevData.current_company;
  avatarImage.src = prevData.image_source;
}
function previousData() {

  document.getElementById('loading').style.display = 'none';
  updateMessageAndProfile();
  showData();
  // console.log("prevData", prevData.current_company, prevData.description, prevData.image_source, prevData.title);
}

function startScraping() {

  document.getElementById('loading').style.display = 'block';
  let json = {};
  let tabUrl = "";
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    tabUrl = tab.url;
    json["Link_Profile"] = tabUrl;
    let result;

    try {
      [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => document.documentElement.innerHTML,
      });
    } catch (e) {
      return;
    }

    const titleRegex = /class="artdeco-entity-lockup__title ember-view">([^<]+)</;

    const titleMatch = result.match(titleRegex);

    const descriptionRegex =
      /class="artdeco-entity-lockup__subtitle ember-view truncate">([^<]+)<\/div>/;
    const descriptionMatch = result.match(descriptionRegex);

    const currentCompanyRegex = /Current company:\s*(.*?)\s*. Click/i;
    const currentCompanyMatch = result.match(currentCompanyRegex);

    const companyLogoRegex =
      /<a data-field="experience_company_logo"[^>]*href="([^"]*)"/i;

    const imgRegex = /<img[^>]+width="200"[^>]+src="([^"]+)"/i;
    const imgMatch = result.match(imgRegex);

    if (imgMatch) {
      let imgSrc = imgMatch[1];
      imgSrc = imgSrc.replace(/amp;/g, '');
      const avatarImage = document.querySelector(".avatar");

      if (avatarImage) {
        prevData["image_source"] = imgSrc;
      }
      console.log(imgSrc);
    }

    const companyLogoMatch = result.match(companyLogoRegex);
    console.log("companyLogoMatch", companyLogoMatch);


    let companyLogoLink = "";
    if (companyLogoMatch) {
      companyLogoLink = companyLogoMatch[1] + "about/";
      json["Link_Company"] = companyLogoMatch[1];
    }

    if (titleMatch) {
      prevData["title"] = titleMatch[1];
    }

    if (descriptionMatch) {
      prevData["description"] = descriptionMatch[1];

    }
    if (currentCompanyMatch) {
      console.log("current_company", currentCompanyMatch[1]);
      prevData["current_company"] = currentCompanyMatch[1];
    }

    localStorage.setItem('prevData', JSON.stringify(prevData));
    json["result"] = result;
    showData();

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
              if (companyLogoMatch) {
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
              }
              else {
                chrome.scripting.executeScript(
                  {
                    target: { tabId: tab.id },
                    function: (tabUrl) => {
                      window.location.href = tabUrl;
                    },
                    args: [tabUrl],
                  },
                  () => {
                    json["resultCompanyLogo"] = "";
                    json["Link_Website"] = "";
                    json["websiteLink"] = "";
                    json["Link_Company"] = "";
                    processAndSendData(json, recentActivityUrl);
                  }
                );

              }
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
          const websiteLinkRegex =
            /<span class="link-without-visited-state" dir="ltr">([^<]+)<\/span>/;
          const websiteLinkMatch = resultCompanyLogo.match(websiteLinkRegex);

          if (websiteLinkMatch) {
            const websiteLink = websiteLinkMatch[1];
            json["Link_Website"] = websiteLink;
            console.log("websiteLink", websiteLink);
            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                function: (websiteLink) => {
                  window.location.href = websiteLink;
                },
                args: [websiteLink],
              },
              () => {
                setTimeout(async () => {
                  const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: () => document.documentElement.innerHTML,
                  });

                  json["websiteLink"] = result;

                  chrome.scripting.executeScript(
                    {
                      target: { tabId: tabId },
                      function: (tabUrl) => {
                        window.location.href = tabUrl;
                      },
                      args: [tabUrl],
                    },
                    () => {
                      processAndSendData(json, url);
                    }
                  );
                }, 4000);
              }
            );
          }
        } catch (e) {
          console.log(e);
        }
      }
    );
  }

  async function processAndSendData(data, url) {
    console.log(data, url);
    // https://staging-liblab-chat-api-q4io2.ondigitalocean.app/outbounder/receive-data/
    // http://localhost:8000/receive-data/
    try {
      const res = await fetch("https://staging-liblab-chat-api-q4io2.ondigitalocean.app/outbounder/receive-data/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: data }),
      });

      const resData = await res.json();
      localStorage.setItem('resData', JSON.stringify(resData));

      console.log(resData);

      updateMessageAndProfile();

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


          json["resultRecentActivity"] = resultRecentActivity;
          callback();
        } catch (e) {
          console.log(e);
        }
      }
    );
  }
}

function copyMessageToClipboard() {
  const messageElement = document.getElementById("message");

  if (messageElement) {
    const messageText = messageElement.textContent;

    const tempTextarea = document.createElement("textarea");
    tempTextarea.value = messageText;
    document.body.appendChild(tempTextarea);

    tempTextarea.select();
    document.execCommand("copy");

    document.body.removeChild(tempTextarea);

  }
}

function updateMessageAndProfile() {

  const responseDiv = document.getElementById("response");
  if (responseDiv) {
    responseDiv.style.display = "block";
  }
  document.getElementById('loading').style.display = 'none';

  const copyButton = document.getElementById("copyMessageButton");
  if (copyButton) {
    copyButton.style.display = "block";
    copyButton.addEventListener("click", copyMessageToClipboard);
  }
  const checkData = localStorage.getItem("resData");
  const resData = JSON.parse(checkData);
  const message = resData.message;
  const profile = resData.summary;
  const Interests = resData.interest;
  const Company_Summary = resData.website_summary;
  const messageElement = document.getElementById("message");
  const profileElement = document.getElementById("profile");


  const InterestsElement = document.getElementById("Interests");
  const Company_SummaryElement = document.getElementById("Company_Summary");

  if (messageElement && profileElement) {
    messageElement.textContent = message;
    profileElement.textContent = profile;


    if (Array.isArray(Interests)) {

      InterestsElement.innerHTML = "";
      Interests.forEach((interest) => {
        const interestItem = document.createElement("p");
        interestItem.textContent = interest;

        const randomColor = getRandomDarkerColor();
        interestItem.style.backgroundColor = randomColor;
        interestItem.style.padding = "10px";
        interestItem.style.borderRadius = "20px";
        interestItem.style.fontSize = "11px";
        interestItem.style.margin = "0px";
        interestItem.style.maxWidth = "100px";
        interestItem.style.minWidth = "70px";

        InterestsElement.appendChild(interestItem);
      });
    } else {

      InterestsElement.textContent = Interests;
    }
    Company_SummaryElement.textContent = Company_Summary;
  }
}

function getRandomDarkerColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    let randomDigit = Math.floor(Math.random() * 14);
    color += letters[randomDigit];
  }
  return color;
}
