chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab && tab.url) {
    if (isLinkedInURL(tab.url)) {

      document.getElementById('startScrapingButton').style.display = 'block';
      document.getElementById('showPreviousButton').style.display = 'block';
      document.getElementById('checkProfile').style.display = 'none';
    } else {
      document.getElementById('startScrapingButton').style.display = 'none';
      document.getElementById('showPreviousButton').style.display = 'none';
      document.getElementById('checkProfile').style.display = 'block';

    }
  }
});

function isLinkedInURL(url) {
  return /linkedin\.com/.test(url);
}
document.getElementById('startScrapingButton').addEventListener('click', startScraping);
document.getElementById('showPreviousButton').addEventListener('click', previousData);
document.getElementById('sendDataButton').addEventListener('click', generateMessage);
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
  document.getElementById('tweakMessageButton').style.display = 'none';

}

function startScraping() {
  let json = {};
  let tabUrl = "";

  const ipAddress = getDeviceIPAddress();
  console.log("Ip-address", ipAddress);
  document.getElementById('loading').style.display = 'block';

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
    //  "http://localhost:8000/receive-data/"
    // "http://localhost:8000/prompt-message/"
    try {
      const res = await fetch("http://localhost:8000/receive-data/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: data }),
      });

      const resData = await res.json();
      localStorage.setItem('resData', JSON.stringify(resData));

      console.log("resData",resData);

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
  document.getElementById('tweakMessageButton').style.display = 'block';

  const copyButton = document.getElementById("copyMessageButton");
 
  if (copyButton) {
    copyButton.addEventListener("click", copyMessageToClipboard);
  }
  const tweakButton = document.getElementById("tweakMessageButton");

  if (tweakButton) {
    tweakButton.addEventListener("click", () => {
      document.getElementById('userInput').style.display = 'block';
      document.getElementById('default_guidance').style.display = 'block';
    });
  }

  const cancelButton = document.getElementById("cancelButton");
  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      const userInputField = document.getElementById("userInputField");
      userInputField.value = "";
      document.getElementById('userInput').style.display = 'none';
      document.getElementById('default_guidance').style.display = 'none';
    });
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

function getDeviceIPAddress() {
  return fetch('http://httpbin.org/ip')
    .then(response => response.json())
    .then(data => {
      return data.origin.PromiseResult;
    })
    .catch(error => {
      console.error('Error fetching IP address:', error);
      return 'Unknown IP Address';
    });
}
let data = {}
function generateMessage() {
 
  const userInputField = document.getElementById('userInputField');
  const userText = userInputField.value;
  // console.log(userText);
  userInputField.value = "";
  data["prompt_message"] = userText;
  console.log("prompting",data);
  sendGeneratedMessage(data);
  
}

async function sendGeneratedMessage(data) {
  document.getElementById('message').style.display = 'none';
  document.getElementById('loading_message').style.display = 'block';
  console.log(data);
  try {
    const res = await fetch("http://localhost:8000/prompt-message/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: data }),
    });

    const resData = await res.json();
    localStorage.setItem('generatedData', JSON.stringify(resData));
    const checkData = localStorage.getItem("generatedData");
    const responseData = JSON.parse(checkData);
    const message = responseData.message;
    const messageElement = document.getElementById("message");

    if (messageElement) {
      messageElement.textContent = message;
      document.getElementById('message').style.display = 'block';
      document.getElementById('loading_message').style.display = 'none';
      const storedData = localStorage.getItem('resData');
      const dataObject = JSON.parse(storedData);
      dataObject.message = message;
      localStorage.setItem('resData', JSON.stringify(dataObject));
    }

    
    console.log(resData);

    

  } catch (error) {
    console.log(error);
  }
}

const defaultOne = document.getElementById("default_one");
const defaultTwo = document.getElementById("default_two");
const defaultThree = document.getElementById("default_three");
const userInputField = document.getElementById("userInputField");

defaultOne.addEventListener("click", function () {
  data["prompt_message"] = defaultOne.textContent;
  userInputField.value = defaultOne.textContent;
  document.getElementById('default_guidance').style.display = 'none';
  sendGeneratedMessage(data);
});

defaultTwo.addEventListener("click", function () {
  data["prompt_message"] = defaultTwo.textContent;
  userInputField.value = defaultTwo.textContent;
  document.getElementById('default_guidance').style.display = 'none';
  sendGeneratedMessage(data);
});

defaultThree.addEventListener("click", function () {
  data["prompt_message"] = defaultThree.textContent;
  userInputField.value = defaultThree.textContent;
  document.getElementById('default_guidance').style.display = 'none';
  sendGeneratedMessage(data);
});