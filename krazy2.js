var TRACE = 'NONE';

var path = [];
var paths = [];

function trace() {
  if (TRACE == 'CONSOLE') {
    console.log.apply(console, arguments);
  } else if (TRACE == 'PATH') {
    path.push([].slice.apply(arguments));
  }
}

function pathTop() {
  path = [];
}

function pathBottom() {
  path.forEach(function(args) { console.log.apply(console, args); });
}

function pathPush() {
  paths.push(path);
  path = [];
}

function pathPop() {
  path = paths.pop();
}

var Krazy = module.exports;

var scripts = document.querySelectorAll('script');
var krazyScripts = [].filter.call(scripts, function(script) {
  return script.getAttribute('type') == 'text/krazy';
}).map(function(script) { return script.innerText; });

var add = hofFunction(function(a, b) { return a + b; });

var items = {
  '+': {js: 'add'},
};

function showItems(name) {
  if (!logDiv) {
    return;
  }
  var s = '<h3>' + name + '</h3><table><tr><th>name</th><th>value</th></tr>';
  for (var item in items) {
    s += '<tr><td>' + item + '</td><td>' + JSON.stringify(items[item]) + '</td></tr>'
  }
  s += '<table>';
  logDiv.innerHTML += s;
}


// FIXME: allow user extension
var constructorToNative = {
  'Nil': function() { return []; },
  'Cons': function(a, b) { return [a].concat(b); }
}

// FIXME: allow user extension.
var nativeToConstructor = {
  'Nil': function(list) {if (list.length == 0) { return []; }; },
  'Cons': function(list) { return list.length == 0 ? undefined : [list[0], list.slice(1)]; }
}

krazyScripts.forEach(function(script) {
  parsedScript = Krazy.parse(script, 'statement_list');
  parsedScript.forEach(function(statement) {
    if (statement.type == 'set') {
      console.assert(statement.lhs.local);
      items[statement.lhs.local] = statement.rhs;
    } else if (statement.type == 'fun') {
      var lName = statement.name.local;
      console.assert(lName);
      if (items[lName]) {
        items[lName].choices.push({bind: statement.bind, eval: statement.rhs});
      } else {
        items[lName] = {type: 'function', choices: [{bind: statement.bind, eval: statement.rhs}]};
      }
    } else if (statement.type == 'data') {
      if (statement.name.foreign) {
	var foo = function() {
	  var fCons = window[statement.name.foreign];
	  for (var i = 0; i < statement.types.length; i++) {
	    var type = statement.types[i];
	    if (type.types.length == 3) {
	      constructorToNative[type.cons] = function() {
		return new fCons(arguments[0], arguments[1], arguments[2]);
	      }
	    }
	  }
	}
	foo();
      } else {
	for (var i = 0; i < statement.types.length; i++) {
	  var type = statement.types[i];
	  var foo = function() {
	    var fCons = window[type.cons.foreign];
	    if (type.types.length == 2) {
	      constructorToNative[type.cons.foreign] = function() {
		return new fCons(arguments[0], arguments[1]);
	      }
	    }
	  }
	  foo();
	}
      }
    } else {
      console.log(statement);
    }
  });
  showItems('initial state');
});

function evaluate(expr) {
  pathPush();
  var result = function() { 
  trace('evaluate:', expr);
  if (expr.type == 'do') {
    trace('do clause')
    expr.list.forEach(function(x) { pathTop(); evaluate(x); });
  } else if (expr.type == 'evaluate') {
    trace('expression', JSON.stringify(expr));
    var evArgs = expr.args.map(evaluate);
    if (expr.fun.local) {
      trace('local function, applying', evArgs, 'to', expr.fun.local);
      return apply(items[expr.fun.local], expr.args);
    } else if (expr.fun.cons) {
      trace('constructor expression')
      console.assert(constructorToNative[expr.fun.cons], expr.fun.cons, constructorToNative);
      return constructorToNative[expr.fun.cons].apply(undefined, evArgs);
    } else {
      return jsApply(jsLookup(expr.fun.js), evArgs);
    }
  } else if (expr.local) {
    trace('local name');
    return items[expr.local];
  } else if (expr.type == 'infix') {
    trace('infix operator');
    return evaluate(items[expr.op]);
  } else if (expr.js) {
    trace('js name');
    return jsLookup(expr.js);
  } else if (typeof expr !== 'function' && expr.bind) {
    trace('pattern matching function clause');

    return hofFunction(function() {
      for (var i = 0; i < expr.bind.length; i++) {
        if (expr.bind[i].local) {
          // TODO: proper scoping
          items[expr.bind[i].local] = arguments[i];
        } else if (expr.bind[i].fun) {
	  var matchFun = nativeToConstructor[expr.bind[i].fun.cons];
	  console.assert(matchFun !== undefined, expr.bind[i]);
	  
	  var matches = matchFun(reduce(arguments[i]));
	  if (matches == undefined) { throw 'MatchFail'; }
	  for (var j = 0; j < matches.length; j++) {
	    // TODO: proper scoping
	    items[expr.bind[i].args[j].local] = matches[j];
	  }
        }
      }
      var r = evaluate(expr.eval);
      return r;
    }, expr.bind.length);
  } else if (expr.choices) {
    trace('pattern matching function');
    evExpr = expr.choices.map(evaluate);
    return new hofFunction(function() {
      var args = Array.prototype.slice.apply(arguments);
      for (var i = 0; i < evExpr.length; i++) {
        // TODO: Handle pattern match failure
        return evExpr[i].apply(window, args);
      }
    }, evExpr[0].length);
  } else if (expr.type == 'list') {
    return expr.value.map(evaluate);
  } else if (expr.type == 'literal') {
    trace('literal value');
    return expr.value;
  } else {
    console.assert(false, 'unknown type', expr);
  }
  }();
  pathPop();
  return result;
}

function reduce(expr) {
  while (expr.type) {
    expr = evaluate(expr);
  }
  return expr;
}

function jsLookup(name) {
  var base = window;
  while (name.indexOf('.') >= 0) {
    base = base[name.substring(0, name.indexOf('.'))];
    name = name.substring(name.indexOf('.') + 1);
  }
  return {base: base, f: base[name], name: name};
}

function apply(fun, args) {
  args = args.map(reduce);
  if (fun.js) {
    return jsApply(jsLookup(fun.js), args);
  } else if (fun.choices) {
    evFun = fun.choices.map(evaluate);
    for (var i = 0; i < evFun.length; i++) {
      // TODO: handle pattern match failure
      try {
        return evFun[i].apply(window, args);
      } catch (e) {
        if (e !== 'MatchFail') {
          throw e;
        }
      }
    }
  } else if (fun.base) {
    var out = fun.f.bind(fun.base);
    for (var i = 0; i < args.length; i++) {
      out = out(args[i]);
    }
    return out;
  } else {
    var out = fun;
    for (var i = 0; i < args.length; i++) {
      out = out(args[i]);
    }
    return out;
  }
}

function jsApply(f, args) {
  args = args.map(reduce);
  args = args.map(function(a) {
    if (a.base) {
      return a.f.bind(a.base);
    }
    return a;
  });
  var r = f.f.apply(f.base, args);
  return r;
}

if (items.main) {
  evaluate(items.main);
}

//         numArgs
//f.length undefined   0-1   2-
//       0    T         F    T
//       1    F         F    T
//       2-   T         F    T
function hofFunction(f, numArgs) {
  if ((numArgs === undefined || numArgs > 1) && (numArgs !== undefined || f.length > 1 || (f.length == 0))) {
    if (numArgs === undefined) {
      numArgs = f.length;
    }
  
    var result = function() {
      var args = Array.prototype.slice.apply(arguments);
      var out = hofFunction(function() {
        var args2 = Array.prototype.slice.apply(arguments);
        args2 = [args[0]].concat(args2);
        return f.apply(null, args2);
      }, numArgs == 0 ? undefined : numArgs - 1);

      for (var i = 1; i < args.length; i++) {
        out = out(args[i]);
      }

      return out;
    }
    result.numArgs = numArgs;
    return result;
  } else {
    return function(x) {
      var args = Array.prototype.slice.apply(arguments);
      var restOfArgs = args.slice(1);
      var out = f(x);
      if (restOfArgs.length == 0) {
        return out;
      }
      return out.apply(undefined, restOfArgs);
    }
  }
}
