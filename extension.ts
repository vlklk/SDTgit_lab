import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const diagnostics = vscode.languages.createDiagnosticCollection('includeAnalyzer');
    context.subscriptions.push(diagnostics);

    context.subscriptions.push(
        vscode.commands.registerCommand("includeAnalyzer.run", () => {
            const doc = vscode.window.activeTextEditor?.document;
            if (doc) {
                analyzeFile(doc, diagnostics);
            }
        })
    );
}

async function analyzeFile(doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    if (!doc || (doc.languageId !== "c" && doc.languageId !== "cpp")) return;

    const text = doc.getText();
    const includeRegex = /#include\s*<([^>]+)>/g;

    const includes: { lib: string, range: vscode.Range }[] = [];
    let match: RegExpExecArray | null;

    while ((match = includeRegex.exec(text)) !== null) {
        const range = new vscode.Range(
            doc.positionAt(match.index),
            doc.positionAt(match.index + match[0].length)
        );
        includes.push({ lib: match[1], range });
    }

    const unusedDiagnostics: vscode.Diagnostic[] = [];
    const includeUsageReport: string[] = [];

    for (const inc of includes) {
        const headerFile = await findHeaderFile(inc.lib);
        let used = false;

        if (headerFile) {
            const headerContent = fs.readFileSync(headerFile, "utf8");
            const functions = extractFunctions(headerContent);

            used = functions.some(fn => {
                const regex = new RegExp("\\b" + fn + "\\b");
                return regex.test(text);
            });
        }

        includeUsageReport.push(`// <${inc.lib}> - ${used ? "use" : "dont use"}`);

        if (!used) {
            unusedDiagnostics.push(
                new vscode.Diagnostic(
                    inc.range,
                    `Библиотека <${inc.lib}> не используется`,
                    vscode.DiagnosticSeverity.Warning
                )
            );
        }
    }

    diagnostics.set(doc.uri, unusedDiagnostics);
    await writeFooter(doc, includeUsageReport);
}

async function findHeaderFile(libName: string): Promise<string | null> {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders) return null;

    for (const ws of wsFolders) {
        const found = await searchFileRecursive(ws.uri.fsPath, libName);
        if (found) return found;
    }
    return null;
}

async function searchFileRecursive(dir: string, name: string): Promise<string | null> {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);

        if (stat.isDirectory()) {
            const res = await searchFileRecursive(full, name);
            if (res) return res;
        } else if (item === name) {
            return full;
        }
    }
    return null;
}

function extractFunctions(headerContent: string): string[] {
    const names: Set<string> = new Set();

    const clean = headerContent
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//gm, "");

    let match: RegExpExecArray | null;

    const classMethodRegex = /([A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    while ((match = classMethodRegex.exec(clean)) !== null) {
        names.add(match[1].split("::")[1]);
    }

    const namespacedRegex = /([A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    while ((match = namespacedRegex.exec(clean)) !== null) {
        const fn = match[1].split("::").pop();
        if (fn) names.add(fn ?? "");
    }

    const freeFuncRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    while ((match = freeFuncRegex.exec(clean)) !== null) {
        const fn = match[1];
        if (!["if", "while", "for", "switch", "return", "sizeof"].includes(fn)) {
            names.add(fn);
        }
    }

    const classBlockRegex = /class\s+[A-Za-z_][A-Za-z0-9_]*\s*{([\s\S]*?)}/g;
    let cls: RegExpExecArray | null;
    while ((cls = classBlockRegex.exec(clean)) !== null) {
        const body = cls[1];
        const methodInsideRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{)]*\);/g;
        let m: RegExpExecArray | null;
        while ((m = methodInsideRegex.exec(body)) !== null) {
            names.add(m[1]);
        }
    }

    const operatorRegex = /(operator[^\s(]+)/g;
    while ((match = operatorRegex.exec(clean)) !== null) {
        names.add(match[1]);
    }

    return Array.from(names);
}

async function writeFooter(doc: vscode.TextDocument, lines: string[]) {
    const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
    if (!editor) return;

    const text = doc.getText();
    const footerRegex = /\/\/ <[^>]+> - (use|dont use)[^\S\r\n]*$/gm;
    const cleaned = text.replace(footerRegex, "");

    const newText = cleaned.trimEnd() + "\n\n" + lines.join("\n") + "\n";

    const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(text.length)
    );

    await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, newText);
    });
}

export function deactivate() {}
