import * as vscode from 'vscode';
import {glob} from "glob";
import { parse } from "jsonc-parser";
import fs = require("fs");

/** Code that is used to associate diagnostic entries with code actions. */
export const UNUSED_BLOCK = 'unused_block';
export const NO_EXPLICIT_USE_BLOCKS = ["store.", "header", "header.", "footer"];

type BlockFormat = {
	props?: {
		Then: string
		Else: string
		[key: string]: string
	},
	blocks?: string[]
	children?: string[]
};

type GenericObject = {
	[key: string]: BlockFormat
};


/** String to detect in the text document. */

/**
 * Analyzes the text document for problems.
 * @param doc text document to analyze
 * @param blocksDiagnostics diagnostic collection
 */
export function refreshDiagnostics(doc: vscode.TextDocument, blocksDiagnostics: vscode.DiagnosticCollection): void {
	const diagnostics: vscode.Diagnostic[] = [];
	
	const currentFilePath = doc.fileName.replace(/\\/g, "/");

	const [folder] = vscode?.workspace?.workspaceFolders || [] as vscode.WorkspaceFolder[];

	const files = glob.sync(folder?.uri?.fsPath + "/**/store/blocks/**/*.{json,jsonc}");

	const allJsons = files.reduce((content: any, file: any, i: any) => {
		const x = fs.readFileSync(
			file,
			{ encoding: "utf-8" }
		);
		if (file.endsWith(".jsonc")) {
			return { ...content, ...parse(x) };
		}
		return { ...content, ...JSON.parse(x) };
	}, {});

	if(!files.includes(currentFilePath)) {return;};

	const currentDocumentText = doc.getText();

	const currentDocumentObject = parse(currentDocumentText);

	const ids = checkKey(currentDocumentObject, allJsons);

	const filteredIds = ids.filter((id: string | undefined) =>{ 
	 return id !== undefined && !NO_EXPLICIT_USE_BLOCKS.some((blockId) => id.startsWith(blockId) ); 
	});

	filteredIds.forEach((id) => {
		for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
			const lineOfText = doc.lineAt(lineIndex);
			if (lineOfText.text.includes( `"${id}"`)) {
				diagnostics.push(createDiagnostic(doc, lineOfText, lineIndex, `"${id}"`));
			}
		}
	});

	blocksDiagnostics.set(doc.uri, diagnostics);
}

function createDiagnostic(doc: vscode.TextDocument, lineOfText: vscode.TextLine, lineIndex: number, word: string): vscode.Diagnostic {
	const index = lineOfText.text.indexOf(word);

	// create range that represents, where in the document the word is
	const range = new vscode.Range(lineIndex, index, lineIndex, index + word.length);

	const diagnostic = new vscode.Diagnostic(range, "Unused block",
		vscode.DiagnosticSeverity.Warning);
	diagnostic.code = UNUSED_BLOCK;
	return diagnostic;
}

export function subscribeToDocumentChanges(context: vscode.ExtensionContext, blocksDiagnostics: vscode.DiagnosticCollection): void {
	const configs = vscode.workspace.getConfiguration('vtexiointellisense');

	if(configs.allowsUnusedBlocks) {return;}

	if (vscode.window.activeTextEditor) {
		refreshDiagnostics(vscode.window.activeTextEditor.document, blocksDiagnostics);
	}
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				refreshDiagnostics(editor.document, blocksDiagnostics);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(e => refreshDiagnostics(e.document, blocksDiagnostics))
	);

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(doc => blocksDiagnostics.delete(doc.uri))
	);

}

// TODO add verify if prop starts with [A-Z]
const checkUse = (id: string, json: GenericObject) => {
  let uses : any;
  Object.entries(json).forEach(([_key, value]) => {

    if ("children" in value) {
      if (!uses) {
        uses = value.children?.includes(id);
      }
    }
    if ("blocks" in value) {
      if (!uses) {
        uses = value.blocks?.includes(id);
      }
    }
		if ("props" in value ) {
			if (value.props?.hasOwnProperty("Then")) {
				if (!uses) {
					uses = value.props.Then.includes(id);
				}
			}
			if (value.props?.hasOwnProperty("Else")) {
				if (!uses) {
					uses = value.props.Else.includes(id);
				}
			}
			// uses = Object.entries(value.props).some(([key, value]) =>
    	// 	 key.startsWith('[A-Z]') && value.includes(id)
			// );
		}
	});
  if (!uses) {
    return id;
  }
};

const checkKey = (currentDocument: any, json: any) => {

  const blockids = Object.entries(currentDocument).map(([key, _value]) =>
    checkUse(key, json)
  );

  return blockids;
};
