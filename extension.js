let API;
const starColorSettingId = "show-github-star-star-color";
const numberColorSettingId = "show-github-star-number-color";
const githubTokenSettingId = "show-github-star-github-token";
const starCache = {};

const internals = {};
internals.anchorSelector = 'a[target="_blank"][href*="github.com"]';
internals.observers = {};

function debounce(fn, wait = 500) {
  let timeoutId = null;
  let debouncedFn = function debouncedFn(...args) {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(fn, wait, ...args);
  };

  return debouncedFn;
}

function onload({ extensionAPI }) {
  initConfig(extensionAPI);

  startObserver("div.roam-main");
  startObserver("div#right-sidebar");
}

function onunload() {
  stopObserver("div.roam-main");
  stopObserver("div#right-sidebar");
}

function initConfig(extensionAPI) {
  API = extensionAPI;
  API.settings.panel.create({
    tabTitle: "Show Github Star",
    settings: [
      {
        id: starColorSettingId,
        name: "Star Color",
        description: "Star's color, default is 'orange'",
        action: {
          type: "input",
          placeholder: "orange / #FFA500 / rgb(255,165,0)",
        },
      },
      {
        id: numberColorSettingId,
        name: "Number Color",
        description: "Number's color, default is 'orange'",
        action: {
          type: "input",
          placeholder: "orange / #FFA500 / rgb(255,165,0)",
        },
      },
      {
        id: githubTokenSettingId,
        name: "Github Token",
        description: "Your Github Personal access token",
        action: {
          type: "input",
          placeholder: "ghp_xxxxxx",
        },
      },
    ],
  });
}

function startObserver(selector) {
  let rootEl = document.querySelector(selector);

  if (rootEl == null) {
    return;
  }

  // reference: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/MutationObserver
  let observerCallback = function observerCallback(mutationList, observer) {
    // we don't care about mutationList; it's simpler (and faster) to just query the DOM directly
    Array.from(rootEl.querySelectorAll(internals.anchorSelector)).forEach(
      addGithubStar
    );
  };

  // debounce the observer callback: "will postpone its execution until after wait = 500ms have elapsed since the last time it was invoked.";
  // otherwise we would be calling querySelectorAll + addGithubStar for every keystroke, which would be unnecessary

  // 创建一个新的 MutationObserver 实例
  internals.observers[selector] = new MutationObserver(
    debounce(observerCallback)
  );

  let observerOptions = {
    attributes: false, // 不关心元素的属性变化
    childList: true, // 关心元素的子元素的添加或移除
    subtree: true, // 关心所有子树中的变化，不仅仅是直接子元素
  };

  // 开始观察 rootEl 元素
  internals.observers[selector].observe(rootEl, observerOptions);

  // force initial execution
  observerCallback();
}

function stopObserver(selector) {
  internals.observers[selector].disconnect();

  let rootEl = document.querySelector(selector);
  Array.from(rootEl.querySelectorAll(internals.anchorSelector)).forEach(
    removeGithubStar
  );
}

function getGithubRepoInfo(url) {
  const regex = /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)/;
  const match = url.match(regex);
  if (match) {
    return {
      userName: match[1],
      repoName: match[2],
    };
  }
  return null;
}

function getGithubStarCount(repoInfo) {
  const { userName, repoName } = repoInfo;
  const url = `https://api.github.com/repos/${userName}/${repoName}`;

  const key = `${userName}/${repoName}`;
  if (starCache[key] !== undefined) {
    return Promise.resolve(starCache[key]);
  }

  return fetch(url, {
    type: "GET",
    headers: {
      Authorization: API.settings.get(githubTokenSettingId) || "",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      const count = data?.stargazers_count;
      const message = data?.message;

      if (count !== undefined) {
        starCache[key] = count;
        return count;
      } else if (message?.includes("API rate limit exceeded")) {
        throw new Error("API rate limit exceeded");
      } else if (message?.includes("Not Found")) {
        throw new Error("Not Found");
      } else {
        throw new Error("cant get star count");
      }
    });
}

function addGithubStar(el) {
  // skip anchor elements that have already been processed
  if (el.dataset.showGithubStar === "true") {
    return;
  }

  const url = el.href;
  const repoInfo = getGithubRepoInfo(url);
  if (!repoInfo) {
    return;
  }

  el.dataset.showGithubStar = "true";

  const starEl = document.createElement("span");
  starEl.className = "bp3-icon bp3-icon-star"; // ⭐
  starEl.style["color"] = API.settings.get(starColorSettingId) || "orange";

  const numEl = document.createElement("span");
  numEl.style["padding-left"] = "2px";
  numEl.style["color"] = API.settings.get(numberColorSettingId) || "orange";

  const boxEl = document.createElement("span");
  boxEl.className = "githubStarBox";
  boxEl.style["padding-left"] = "6px";
  boxEl.style["display"] = "inline-flex";
  boxEl.style["line-height"] = "1";

  getGithubStarCount(repoInfo)
    .then((starCount) => {
      numEl.innerText = starCount;

      boxEl.appendChild(starEl);
      boxEl.appendChild(numEl);
      el.appendChild(boxEl);

      // el.dataset.showGithubStar = "true";
    })
    .catch((err) => {
      console.log("get GithubStarCount err", err);
    });
}

function removeGithubStar(el) {
  if (el.dataset.showGithubStar === "true") {
    const boxEl = el.querySelector(".githubStarBox");
    el.removeChild(boxEl);
    el.dataset.showGithubStar = "";
  }
}

export default {
  onload,
  onunload,
};
