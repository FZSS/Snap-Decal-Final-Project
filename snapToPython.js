var snapToPython = {
	reportSum: '(%n + %n)',
	reportDifference: '(%n - %n)',
	reportProduct: '(%n * %n)',
	reportQuotient: '(%n / %n)',
	forward: "move(%n)",
	doForever: "while True:",
	doRepeat: "for i in range(0, %n):",
	doUntil: "while not %n:",
	doIf: "if %n:",
	doIfElse: "if %n:",
	doElif: "elif %n:",
	reportLessThan: "(%n < %n)",
	reportEquals: "(%n == %n)",
	reportGreaterThan: "(%n > %n)",
	reportAnd: "(%n and %n)",
	reportOr: "(%n or %n)",
	reportNot: "(not %n)",
	doSetVar: "%n = %n",
	doChangeVar: "%n += %n",
	doReport: "return %n",
	reportNewList: "[]",
	reportListItem: "%1[%0]",
	doReplaceInList: "%1[%0] = %2",
	doAddToList: "%1.append(%0)",
	bubble: "print(%n)",
	reportListLength: "len(%n)"
}

var isControl = function(block) {
	var spec = SpriteMorph.prototype.blocks[block.selector].spec;
	if (!spec) {
		console.log("Error, block not supported");
	}
	return containsElem(spec, "%c")
}


var getCode = function(func) {
	var result = snapToPython[func];
	if (!result) {
		console.log("Error, block not supported");
	}
	return result
} 

var Label = function(string) {
	this.string = string;
	this.args = [];
}

Label.prototype.addArg = function(arg) {
	this.args.push(arg)
}

Label.prototype.toString = function() {
	var result = this.string;
	for (i = 0; i < this.args.length; i++) {
		if (result.indexOf("%" + i) != -1) {
			result = result.replace("%" + i, this.args[i])
		} else {
			result = result.replace("%n", this.args[i])
		}
	}
	if (containsElem(result, "%n")) {
		console.log("ERROR: not enough arguments");
	}
	return result
}


var convertSnapToPython = function(block) {
	//var topBlock = block.inputs()[0].children[0].evaluate();
	var resultScript = evaluateScript(block, "");
	console.log(resultScript);
	var uri = "data:text/x-python-script;base64," + btoa(resultScript);
	window.open(uri, "_blank");
}

var evaluateScript = function(block, indent) {
	var funcDefs = [];
	var result = "";
	while (block != null) {
		if (block.selector == "doDeclareVariables") {
			block = block.nextBlock();
			continue
		} else if (block.selector == "evaluateCustomBlock") {
			var body = block.definition.body;
			var bodyScript = body ?
				evaluateScript(body.expression, indent + "    ") :
				indent + "    " + "pass";
			var name = specToName(block.blockSpec);
			var header = getCustomBlockHeader(block, name) + "\n";
			result += indent + evaluateCustomBlock(block, name) + "\n";
			var newDef = header + bodyScript;
			if (funcDefs.indexOf(newDef) == -1) {
				funcDefs.push(newDef);
			}
 		} else if (!isControl(block)) {
			result += indent + evaluateCommand(block) + "\n";
		} else if (block.selector == "doForever") {
			result += evaluateForever(block, indent);
		} else if (block.selector == "doIfElse") {
			result += evaluateIfElse(block, indent);
		} else {
			result += evaluateControl(block, indent);
		}
		block = block.nextBlock();
	}
	if (funcDefs.length > 0) {
		return funcDefs.join("\n") + "\n" + result;
	}
	return result;
}


var evaluateCommand = function(command) {
	var label = new Label(getCode(command.selector));
	var inputs = command.inputs();
	for (var i = 0; i < inputs.length; i ++) {
		label.addArg(evaluateInput(inputs[i]));
	}
	return label.toString();
}

var evaluateInput = function(input) {
	if (input instanceof ArgMorph) {
		var result = input.evaluate();
		var num = Number(result);
		console.log(result);
		if (!input.isReadOnly && isNaN(num) && !(result instanceof Array)) {
			return '"' + result + '"';
		} else {
			return result;
		}
	}
	if (input.selector == "reportGetVar") {
		return input.blockSpec;
	}
	var inputs = input.inputs();
	if (input.selector == "reportNewList") {
		var spec = "[";
		for (var i = 0; i < inputs.length; i++) {
			spec += "%n, ";
		}
		spec = spec.slice(0, -2) + "]";
		snapToPython[input.selector] = spec;
	}
	var label = new Label(getCode(input.selector));
	for (var i = 0; i < inputs.length; i++) {
		label.addArg(evaluateInput(inputs[i]));
	}
	return label.toString();
}

var evaluateForever = function(block, indent) {
	var result = "";
	result += indent + getCode("doForever") + "\n";
	var nextBlock = block.inputs()[0].evaluate();
	if (nextBlock) {
		result += evaluateScript(nextBlock, indent + "    ");
	}
	return result
}

var evaluateControl = function(block, indent) {
	var inputs = block.inputs();
	var result = "";
	var label = new Label(getCode(block.selector));
	label.addArg(evaluateInput(inputs[0]))
	result += indent + label.toString() + "\n";
	var nextBlock = inputs[1].evaluate();
	if (nextBlock) {
		result += evaluateScript(nextBlock, indent + "    ");
	}
	return result
}

var evaluateIfElse = function(block, indent) {
	var inputs = block.inputs();
	var result = "";
	result += evaluateControl(block, indent);
	var elseClause = inputs[2].evaluate();
	if (!elseClause){
		return result;
	}
	var elif = (containsElem(["doIf", "doIfElse"], elseClause.selector)
		&& elseClause.blockSequence().length == 1);
	while (elif) {
		block = inputs[2].evaluate();
		var inputs = block.inputs();
		var label = new Label(getCode("doElif"));
		label.addArg(evaluateInput(inputs[0]));
		result += indent + label.toString() + "\n";
		var elifClause = inputs[1].evaluate();
		if (!elifClause){
			result += "\n";
		} else {
			result += evaluateScript(elifClause, indent + "    ");
		}
		var elseClause = inputs[2].evaluate();
		elif = (block.selector == "doIfElse") &&
			(containsElem(["doIf", "doIfElse"], elseClause.selector))
			&& (elseClause.blockSequence.length == 1);
	}
	if (block.selector == "doIfElse") {
		result += indent + "else:\n";
		var elseClause = inputs[2].evaluate();
		if (elseClause){
			result += evaluateScript(elseClause, indent + "    ");
		}
	}
	return result;
}

var evaluateCustomBlock = function(block, name) {
	var result = name + "(";
	var inputs = block.inputs();
	for (var i = 0; i < inputs.length; i++) {
		result += evaluateInput(inputs[i]) + ", ";
	}
	result = result.slice(0, -2) + ")";
	return result;
}


var getCustomBlockHeader = function(block, name) {
	var result = "def " + name + "(";
	var body = block.definition.body;
	var params = body ? body.inputs : [];
	for (var i = 0; i < params.length; i++) {
		result += params[i] + ", ";
	}
	if (body) {
		result = result.slice(0, -2) + "):";
	} else {
		result += "):";
	}
	return result;
}


var containsElem = function(array, element) {
	return (array.indexOf(element) != -1)
}


var specToName = function(spec) {
	var result = spec.replace(/%./g, "");
	result = result.replace(/ /g, "");
	result = result.split(" ");
	result = result.filter(function(e){return e});
	result = result.join("_");
	return result;
}





