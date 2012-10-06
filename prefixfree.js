/**
 * StyleFix 1.0.3 & PrefixFree 1.0.7
 * @author Lea Verou
 * MIT license
 */

(function(){

if(!window.addEventListener) {
	return;
}

var self = window.StyleFix = {
	link: function(link) {
		try {
			// Ignore stylesheets with data-noprefix attribute as well as alternate stylesheets
			if(link.rel !== 'stylesheet' || link.hasAttribute('data-noprefix')) {
				return;
			}
		}
		catch(e) {
			return;
		}

		var url = link.href || link.getAttribute('data-href'),
		    base = url.replace(/[^\/]+$/, ''),
		    parent = link.parentNode,
		    xhr = new XMLHttpRequest(),
		    process;
		
		xhr.onreadystatechange = function() {
			if(xhr.readyState === 4) {
				process();
			}
		};

		process = function() {
				var css = xhr.responseText;
				
				if(css && link.parentNode && (!xhr.status || xhr.status < 400 || xhr.status > 600)) {
					css = self.fix(css, true, link);
					
					// Convert relative URLs to absolute, if needed
					if(base) {
						css = css.replace(/url\(\s*?((?:"|')?)(.+?)\1\s*?\)/gi, function($0, quote, url) {
							if(!/^([a-z]{3,10}:|\/|#)/i.test(url)) { // If url not absolute & not a hash
								// May contain sequences like /../ and /./ but those DO work
								return 'url("' + base + url + '")';
							}
							
							return $0;						
						});

						// behavior URLs shoudn’t be converted (Issue #19)
						// base should be escaped before added to RegExp (Issue #81)
						var escaped_base = base.replace(/([\\\^\$*+[\]?{}.=!:(|)])/g,"\\$1");
						css = css.replace(RegExp('\\b(behavior:\\s*?url\\(\'?"?)' + escaped_base, 'gi'), '$1');
						}
					
					self.applyStyleSheet(css, link.media, link.disabled, {
						'data-href': link.getAttribute('href')
					}, function(style) {
						parent.insertBefore(style, link);
					});
					
					parent.removeChild(link);
				}
		};

		try {
			xhr.open('GET', url);
			xhr.send(null);
		} catch (e) {
			// Fallback to XDomainRequest if available
			if (typeof XDomainRequest != "undefined") {
				xhr = new XDomainRequest();
				xhr.onerror = xhr.onprogress = function() {};
				xhr.onload = process;
				xhr.open("GET", url);
				xhr.send(null);
			}
		}
		
		link.setAttribute('data-inprogress', '');
	},

	styleElement: function(style) {
		if (style.hasAttribute('data-noprefix')) {
			return;
		}
		
		var css = self.fix(style.textContent, true, style);
		
		self.applyStyleSheet(css, style.media, style.disabled, null, function(newStyle) {
			style.parentNode.insertBefore(newStyle, style);
		});
		
		style.parentNode.removeChild(style);
	},

	styleAttribute: function(element) {
		var css = element.getAttribute('style');
		
		css = self.fix(css, false, element);
		
		element.setAttribute('style', css);
	},
	
	applyStyleSheet: function(css, media, disabled, attributes, apply) {
		var styleElement = document.createElement('style');
		styleElement.textContent = css;
		styleElement.media = media;
		styleElement.disabled = disabled;
		for (var attributeName in attributes) {
			styleElement.setAttribute(attributeName, attributes[attributeName]);
		}
		
		if (styleElement.styleSheet && styleElement.styleSheet.cssRules) {
			// Append an HTMLStyleElement for each rule and manually 
			// set its media property.
			// This works around a @media bug in IE9. See issue #109.
			
			// TODO: Aggregate CSSRules to add the smallest possible number 
			// of style elements. Be mindful of their order. This is 
			// important because IE9 has a limit of 31 stylesheets:
			// http://support.microsoft.com/kb/262161
			for (var n = 0; n < styleElement.styleSheet.cssRules.length; n++) {
				var cssRule = styleElement.styleSheet.cssRules[n];
				
				var singleRuleStyleElement = styleElement.cloneNode();
				if (cssRule.media) {
					singleRuleStyleElement.media = self.combineMediaQueryLists(singleRuleStyleElement.media, cssRule.media.mediaText);
				}
				// TODO: Could use cssRule.cssRules (a CSSRuleList) for 
				// CSSMediaRules to avoid the unnecessary @media in 
				// .cssText.
				singleRuleStyleElement.textContent = cssRule.cssText;
				
				apply(singleRuleStyleElement);
			}
		}
		else {
			// Standards-compliant browsers don't have 
			// HTMLStyleElement.styleSheet, but they don't need the 
			// workaround.
			apply(styleElement);
		}
	},
	
	// "a, b and c" combined with "d, e" yields:
	// 	a and d,
	// 	a and e,
	// 	b and c and d,
	// 	b and c and e
	combineMediaQueryLists: function(queryList1, queryList2) {
		var cartesianProduct = function(array1, array2) {
			var product = [];
			array2.forEach(function(element2) {
				array1.forEach(function(element1) {
					product.push([element1, element2]);
				});
			});
			return product;
		};
		
		var parsedQueryList1 = queryList1.split(/\s*,\s*/);
		var parsedQueryList2 = queryList2.split(/\s*,\s*/);
		
		var combinations = cartesianProduct(parsedQueryList1, parsedQueryList2);
		var combinedQuery = combinations.map(function(combination) {
			// Combination is a ['query', 'query'] pair.
			return self.combineMediaQueries(combination[0], combination[1]);
		}).join(', ');
		
		return combinedQuery;
	},
	
	combineMediaQueries: function(query1, query2) {
		// Matches 'all' and 'all and '.
		var impliedAll = /^all\b(?:\s*and\b)?\s*/i;
		
		query1 = query1.replace(impliedAll, '').trim();
		query2 = query2.replace(impliedAll, '').trim();
		
		// If one of the queries is empty, just use the other one.
		if (!(query1 && query2)) {
			return query1 || query2;
		}
		else {
			/* FIXME:
				There's no such thing as "and" as far as media TYPES go 
				(e.g. "screen and print" is meaningless/invalid). Media 
				types also always need to occur at the start of the query 
				(e.g. "(min-width:600px) and screen" is illegal).
				
				The grammar from the spec is as follows:
					media_query_list
					 : S* [media_query [ ',' S* media_query ]* ]?
					 ;
					media_query
					 : [ONLY | NOT]? S* media_type S* [ AND S* expression ]*
					 | expression [ AND S* expression ]*
					 ;
					media_type
					 : IDENT
					 ;
					expression
					 : '(' S* media_feature S* [ ':' S* expr ]? ')' S*
					 ;
					media_feature
					 : IDENT
					 ;
				
				Currently-specified media types are:
					- aural
					- braille
					- handheld
					- print
					- projection
					- screen
					- tty
					- tv
					- embossed
				
				Things that need to be dealt with (this list is probably 
				not comprehensive):
					- If only one of the queries has a type then it needs 
					  to go first.
						- Can simply be "if query2 begins with a media 
						  type put it first".
					- If both begin with the same media type it needs to 
					  only occur once.
						- Be wary of "only" and "not".
					- If both begin with different types (without "not") 
					  then it doesn't really matter what prefixfree does 
					  because the query would never be true anyway.
						- Unless there are any cases where a browser can 
						  respond to multiple media types simultaneously; 
						  this isn't prohibited by the spec, and it 
						  wouldn't be too crazy for e.g. something like 
						  a phone to to respond to both "handheld" and 
						  "screen".
					- Deal with "not".
						- This will be incredibly complicated:
							<style media="not screen">
								@media (monochrome) {...}
							</style>
							- Means:
								(not screen) and (monochrome)
							- But will be compiled to:
								"not screen and (monochrome)"
							- Which means:
								not (screen and (monochrome))
							- Would have to list out all non-screen 
							  types to accurately represent it:
								"aural and (monochrome), braille and (monochrome), handheld and (monochrome), print and (monochrome), ..."
						- Type-only queries with one "not" are simpler:
							<style media="not screen">
								@media print {...}
							</style>
							- Should just become:
								"print"
						- But type-only queries where both have "not" 
						  get complex again:
							<style media="not screen">
								@media not print {...}
							</style>
							- Should become:
								"aural, braille, handheld, projection, ..." (every type except screen and print)
						- Two of the same type with one "not" need to 
						  become "not all":
							<style media="not screen">
								@media screen {...}
							</style>
							- Should become:
								"not all"
					- Deal with "only".
						- Can it just always be dropped?
						- Maybe all combined queries should get an "only" 
						  tacked on to hide them from older browsers that 
						  won't support "and".
			*/
			
			return query1 + ' and ' + query2;
		}
	},
	
	process: function() {
		// Linked stylesheets
		$('link[rel="stylesheet"]:not([data-inprogress])').forEach(StyleFix.link);
		
		// Inline stylesheets
		$('style').forEach(StyleFix.styleElement);
		
		// Inline styles
		$('[style]').forEach(StyleFix.styleAttribute);
	},
	
	register: function(fixer, index) {
		(self.fixers = self.fixers || [])
			.splice(index === undefined? self.fixers.length : index, 0, fixer);
	},
	
	fix: function(css, raw, element) {
		for(var i=0; i<self.fixers.length; i++) {
			css = self.fixers[i](css, raw, element) || css;
		}
		
		return css;
	},
	
	camelCase: function(str) {
		return str.replace(/-([a-z])/g, function($0, $1) { return $1.toUpperCase(); }).replace('-','');
	},
	
	deCamelCase: function(str) {
		return str.replace(/[A-Z]/g, function($0) { return '-' + $0.toLowerCase() });
	}
};

/**************************************
 * Process styles
 **************************************/
(function(){
	setTimeout(function(){
		$('link[rel="stylesheet"]').forEach(StyleFix.link);
	}, 10);
	
	document.addEventListener('DOMContentLoaded', StyleFix.process, false);
})();

function $(expr, con) {
	return [].slice.call((con || document).querySelectorAll(expr));
}

})();

/**
 * PrefixFree
 */
(function(root){

if(!window.StyleFix || !window.getComputedStyle) {
	return;
}

// Private helper
function fix(what, before, after, replacement, css) {
	what = self[what];
	
	if(what.length) {
		var regex = RegExp(before + '(' + what.join('|') + ')' + after, 'gi');

		css = css.replace(regex, replacement);
	}
	
	return css;
}

var self = window.PrefixFree = {
	prefixCSS: function(css, raw, element) {
		var prefix = self.prefix;
		
		// Gradient angles hotfix
		if(self.functions.indexOf('linear-gradient') > -1) {
			// Gradients are supported with a prefix, convert angles to legacy
			css = css.replace(/(\s|:|,)(repeating-)?linear-gradient\(\s*(-?\d*\.?\d*)deg/ig, function ($0, delim, repeating, deg) {
				return delim + (repeating || '') + 'linear-gradient(' + (90-deg) + 'deg';
			});
		}
		
		css = fix('functions', '(\\s|:|,)', '\\s*\\(', '$1' + prefix + '$2(', css);
		css = fix('keywords', '(\\s|:)', '(\\s|;|\\}|$)', '$1' + prefix + '$2$3', css);
		css = fix('properties', '(^|\\{|\\s|;)', '\\s*:', '$1' + prefix + '$2:', css);
		
		// Prefix properties *inside* values (issue #8)
		if (self.properties.length) {
			var regex = RegExp('\\b(' + self.properties.join('|') + ')(?!:)', 'gi');
			
			css = fix('valueProperties', '\\b', ':(.+?);', function($0) {
				return $0.replace(regex, prefix + "$1")
			}, css);
		}
		
		if(raw) {
			css = fix('selectors', '', '\\b', self.prefixSelector, css);
			css = fix('atrules', '@', '\\b', '@' + prefix + '$1', css);
		}
		
		// Fix double prefixing
		css = css.replace(RegExp('-' + prefix, 'g'), '-');
		
		// Prefix wildcard
		css = css.replace(/-\*-(?=[a-z]+)/gi, self.prefix);
		
		return css;
	},
	
	property: function(property) {
		return (self.properties.indexOf(property)? self.prefix : '') + property;
	},
	
	value: function(value, property) {
		value = fix('functions', '(^|\\s|,)', '\\s*\\(', '$1' + self.prefix + '$2(', value);
		value = fix('keywords', '(^|\\s)', '(\\s|$)', '$1' + self.prefix + '$2$3', value);
		
		// TODO properties inside values
		
		return value;
	},
	
	// Warning: Prefixes no matter what, even if the selector is supported prefix-less
	prefixSelector: function(selector) {
		return selector.replace(/^:{1,2}/, function($0) { return $0 + self.prefix })
	},
	
	// Warning: Prefixes no matter what, even if the property is supported prefix-less
	prefixProperty: function(property, camelCase) {
		var prefixed = self.prefix + property;
		
		return camelCase? StyleFix.camelCase(prefixed) : prefixed;
	}
};

/**************************************
 * Properties
 **************************************/
(function() {
	var prefixes = {},
		properties = [],
		shorthands = {},
		style = getComputedStyle(document.documentElement, null),
		dummy = document.createElement('div').style;
	
	// Why are we doing this instead of iterating over properties in a .style object? Cause Webkit won't iterate over those.
	var iterate = function(property) {
		if(property.charAt(0) === '-') {
			properties.push(property);
			
			var parts = property.split('-'),
				prefix = parts[1];
				
			// Count prefix uses
			prefixes[prefix] = ++prefixes[prefix] || 1;
			
			// This helps determining shorthands
			while(parts.length > 3) {
				parts.pop();
				
				var shorthand = parts.join('-');

				if(supported(shorthand) && properties.indexOf(shorthand) === -1) {
					properties.push(shorthand);
				}
			}
		}
	},
	supported = function(property) {
		return StyleFix.camelCase(property) in dummy;
	}
	
	// Some browsers have numerical indices for the properties, some don't
	if(style.length > 0) {
		for(var i=0; i<style.length; i++) {
			iterate(style[i])
		}
	}
	else {
		for(var property in style) {
			iterate(StyleFix.deCamelCase(property));
		}
	}

	// Find most frequently used prefix
	var highest = {uses:0};
	for(var prefix in prefixes) {
		var uses = prefixes[prefix];

		if(highest.uses < uses) {
			highest = {prefix: prefix, uses: uses};
		}
	}
	
	self.prefix = '-' + highest.prefix + '-';
	self.Prefix = StyleFix.camelCase(self.prefix);
	
	self.properties = [];

	// Get properties ONLY supported with a prefix
	for(var i=0; i<properties.length; i++) {
		var property = properties[i];
		
		if(property.indexOf(self.prefix) === 0) { // we might have multiple prefixes, like Opera
			var unprefixed = property.slice(self.prefix.length);
			
			if(!supported(unprefixed)) {
				self.properties.push(unprefixed);
			}
		}
	}
	
	// IE fix
	if(self.Prefix == 'Ms' 
	  && !('transform' in dummy) 
	  && !('MsTransform' in dummy) 
	  && ('msTransform' in dummy)) {
		self.properties.push('transform', 'transform-origin');	
	}
	
	self.properties.sort();
})();

/**************************************
 * Values
 **************************************/
(function() {
// Values that might need prefixing
var functions = {
	'linear-gradient': {
		property: 'backgroundImage',
		params: 'red, teal'
	},
	'calc': {
		property: 'width',
		params: '1px + 5%'
	},
	'element': {
		property: 'backgroundImage',
		params: '#foo'
	},
	'cross-fade': {
		property: 'backgroundImage',
		params: 'url(a.png), url(b.png), 50%'
	}
};


functions['repeating-linear-gradient'] =
functions['repeating-radial-gradient'] =
functions['radial-gradient'] =
functions['linear-gradient'];

var keywords = {
	'initial': 'color',
	'zoom-in': 'cursor',
	'zoom-out': 'cursor',
	'box': 'display',
	'flexbox': 'display',
	'inline-flexbox': 'display',
	'flex': 'display',
	'inline-flex': 'display'
};

self.functions = [];
self.keywords = [];

var style = document.createElement('div').style;

function supported(value, property) {
	style[property] = '';
	style[property] = value;

	return !!style[property];
}

for (var func in functions) {
	var test = functions[func],
		property = test.property,
		value = func + '(' + test.params + ')';
	
	if (!supported(value, property)
	  && supported(self.prefix + value, property)) {
		// It's supported, but with a prefix
		self.functions.push(func);
	}
}

for (var keyword in keywords) {
	var property = keywords[keyword];

	if (!supported(keyword, property)
	  && supported(self.prefix + keyword, property)) {
		// It's supported, but with a prefix
		self.keywords.push(keyword);
	}
}

})();

/**************************************
 * Selectors and @-rules
 **************************************/
(function() {

var 
selectors = {
	':read-only': null,
	':read-write': null,
	':any-link': null,
	'::selection': null
},

atrules = {
	'keyframes': 'name',
	'viewport': null,
	'document': 'regexp(".")'
};

self.selectors = [];
self.atrules = [];

var style = root.appendChild(document.createElement('style'));

function supported(selector) {
	style.textContent = selector + '{}';  // Safari 4 has issues with style.innerHTML
	
	return !!style.sheet.cssRules.length;
}

for(var selector in selectors) {
	var test = selector + (selectors[selector]? '(' + selectors[selector] + ')' : '');
		
	if(!supported(test) && supported(self.prefixSelector(test))) {
		self.selectors.push(selector);
	}
}

for(var atrule in atrules) {
	var test = atrule + ' ' + (atrules[atrule] || '');
	
	if(!supported('@' + test) && supported('@' + self.prefix + test)) {
		self.atrules.push(atrule);
	}
}

root.removeChild(style);

})();

// Properties that accept properties as their value
self.valueProperties = [
	'transition',
	'transition-property'
]

// Add class for current prefix
root.className += ' ' + self.prefix;

StyleFix.register(self.prefixCSS);


})(document.documentElement);
