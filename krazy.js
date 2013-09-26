var module = {}

var script = document.createElement('script');
script.setAttribute('src', 'hsp.js');
document.documentElement.appendChild(script);

onload = function() {
  script = document.createElement('script');
  script.setAttribute('src', 'krazy2.js');
  document.documentElement.appendChild(script);
}
