
function redirect(params, token) {
  var url = params.redirect_uri + (token ? '#access_token=' + encodeURIComponent(token) : '');
  document.location = url;
}

var _afterRender = [];
function afterRender(callback) { _afterRender.push(callback); }

function renderTemplate(name, locals) {
  var el = document.querySelector('script[data-template-name="' + name + '"]');
  if(! el) {
    var templateNames = Array.prototype.map.call(
      document.querySelectorAll('script[data-template-name]'),
      function(template) {
        return template.getAttribute('data-template-name');
      }
    );
    throw "Template not found: " + name + " (have: " + templateNames.join(', ') + ")";
  }
  try {
    document.getElementById('wrapper').innerHTML = Mustache.render(el.innerHTML, locals);
  } catch(exc) {
    console.error("Failed to render template: " + exc.message);
  }
  setTimeout(function() {
    _afterRender.forEach(function(callback) { callback(); });
  }, 0);
}

function attachAction(element, handler) {
  if(element.tagName === 'FORM') {
    element.onsubmit = handler;
  } else {
    element.onclick = handler;
  }
}

function setAction(name, handler) {
  var element = document.querySelector('*[data-action="' + name + '"]');
  if(! element) {
    throw "Action element not found: " + name;
  }
  attachAction(element, handler);
}

function setEachAction(name, handler) {
  var els = document.querySelectorAll('*[data-action="' + name + '"]');
  for(var i=0;i<els.length;i++) {
    attachAction(els[i], handler);
  }
}

function dialog(sessionKey, params) {
  console.log("SCOPE", params.scope);
  var viewLocals = {
    origin: params.origin,
    scope: []
  };
  for(var key in params.scope) {
    viewLocals.scope.push({
      category: key,
      mode: params.scope[key] == 'rw' ? 'read, write' : 'read'
    });
  }
  renderTemplate('dialog', viewLocals);

  setAction('allow', function() {
    sockethubClient.getBearerToken(sessionKey, params.origin, params.scope).
      then(function(token) {
        redirect(params, token);
      }, function(error) {
        displayError('getBearerToken failed: ' + error.message);
      });
  });
  setAction('reject', function() { redirect(params); });
}

function extractOrigin(uri) {
  var md = uri.match(/^(https?:\/\/[^\/]+)\//);
  if(md) {
    return md[1];
  } else {
    throw "Invalid http(s) URI: " + uri;
  }
}

function parseScope(scopeString) {
  return scopeString.split(' ').reduce(function(m, part) {
    var kv = part.split(':');
    m[kv[0]] = kv[1];
    return m;
  }, {});
}

function renderListing(sessionKey) {
  renderTemplate('list', { loading: true });
  sockethubClient.listBearerTokens(sessionKey).then(function(response) {
    var tokens = response.object.tokens;
    renderTemplate('list', { authorizations: tokens, empty: !tokens.length });
    setEachAction('revoke', function(evt) { alert('not implemented!'); });
  }, function(error) { displayError('listBearerTokens failed: ' + error.message); });
}

function displayError(msg) {
  var el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = 'block';
}

function main(sessionKey) {
  var md = document.location.search.match(/\?(.+)/);
  afterRender(function() {
    setAction('logout', function() {
      delete localStorage.unhtAuthSessionKey;
      document.location = '/';
    });
  });

  if(md) {
    var params = md[1].split('&').reduce(function(m, kvs) {
      var kv = kvs.split('=');
      m[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      return m;
    }, {});
    if(params.redirect_uri && params.scope) {
      params.origin = extractOrigin(params.redirect_uri);
      params.scope = parseScope(params.scope);
      dialog(sessionKey, params);
    }
  } else {
    renderListing(sessionKey);
  }
}

window.onload = function() {
  sockethubClient = SockethubClient.connect({
    host: document.body.getAttribute('data-sockethub-host'),
    ssl: true,
    register: {
      secret: document.body.getAttribute('data-sockethub-secret')
    }
  });

  sockethubClient.declareVerb('getSession', ['object.email', 'object.password'], {
    platform: 'customer',
    object: {}
  });

  sockethubClient.declareVerb('listBearerTokens', ['object.sessionKey'], {
    platform: 'customer',
    object: {}
  });

  sockethubClient.declareVerb('getBearerToken', ['object.sessionKey', 'object.origin', 'object.scope'], {
    platform: 'customer',
    object: {}
  });

  sockethubClient.declareVerb('revokeBearerToken', ['object.sessionKey', 'object.origin', 'object.token'], {
    platform: 'customer',
    object: {}
  });

  sockethubClient.on('failed', function() {
    alert("Failed to connect to sockethub!");
  });

  sockethubClient.on('registered', function() {

    if(localStorage.unhtAuthSessionKey) {
      main(localStorage.unhtAuthSessionKey);
    } else {
      renderTemplate('login', { host: document.body.getAttribute('data-sockethub-host') });
      document.querySelector('input[name=email]').focus();
      setAction('login', function(evt) {
        evt.preventDefault();
        sockethubClient.getSession(
          evt.target.email.value,
          evt.target.password.value
        ).then(function(response) {
          if(response.status) {
            localStorage.unhtAuthSessionKey = response.object.sessionKey;
            main(localStorage.unhtAuthSessionKey);
          } else {
            displayError("Login failed: " + response.message);
          }
        }, function(error) {
          displayError('getSession failed: ' + error.message);
        });
      });
    }
  });

};
