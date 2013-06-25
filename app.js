
function redirect(params, token) {
  var url = params.redirect_uri + (token ? '#access_token=' + encodeURIComponent(token) : '');
  alert('redirect: ' + url);
}

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
  document.getElementById('wrapper').innerHTML = Mustache.render(el.innerHTML, locals);
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

function dialog(params) {
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

function renderListing() {
  // stub!
  renderTemplate('list', { authorizations: [] });
  setEachAction('revoke', function(evt) {});
}

function main() {
  var md = document.location.search.match(/\?(.+)/);
  if(md) {
    var params = md[1].split('&').reduce(function(m, kvs) {
      var kv = kvs.split('=');
      m[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      return m;
    }, {});
    if(params.redirect_uri && params.scope) {
      var origin = extractOrigin(params.redirect_uri);
      var scope = parseScope(params.scope);
    }
  } else {
    renderListing();
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
    platform: 'unht-customer',
    object: {}
  });

  sockethubClient.on('failed', function() {
    alert("Failed to connect to sockethub!");
  });

  sockethubClient.on('registered', function() {

    if(localStorage.unhtAuthSessionKey) {
      main(localStorage.unhtAuthSessionKey);
    } else {
      renderTemplate('login');
      setAction('login', function(evt) {
        evt.preventDefault();
        sockethubClient.getSession(
          evt.target.email.value,
          evt.target.password.value
        ).then(function(response) {
          localStorage.unhtAuthSessionKey = response.object.sessionKey;
          main(localStorage.unhtAuthSessionKey);
        }, function(error) {
          var el = document.getElementById('error');
          el.textContent = error.message;
          el.style.display = 'block';
        });
      });
    }
  });

};
