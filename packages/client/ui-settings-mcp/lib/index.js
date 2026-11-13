import fs from "node:fs";
import os from "node:os";
import path from "node:path";
//#region lib/index.js
const inject = ["webServer"];
function parseMcpPatch(text) {
	const servers = [];
	const entries = text.split(/(?=^-\s+id:\s*mcp-)/m);
	for (const entry of entries) {
		if (!entry.includes("@deepseek-ai/dsh-mcp-client")) continue;
		const nameMatch = entry.match(/serverName:\s*['"]?([^'"\n\r]+)['"]?/);
		const cmdMatch = entry.match(/command:\s*['"]?([^'"\n\r]+)['"]?/);
		const transMatch = entry.match(/transport:\s*['"]?([^'"\n\r]+)['"]?/);
		const args = [];
		const argsBlock = entry.match(/args:\s*(\[[^\]]*\]|(?:\n\s+-\s+[^\n\r]+)+)/);
		if (argsBlock) if (argsBlock[1].trim().startsWith("[")) try {
			args.push(...JSON.parse(argsBlock[1]));
		} catch (_) {}
		else {
			const itemMatches = argsBlock[1].matchAll(/^\s+-\s+['"]?([^'"\n\r]+)['"]?/gm);
			for (const m of itemMatches) args.push(m[1].trim());
		}
		if (nameMatch) servers.push({
			id: "mcp-" + nameMatch[1].trim(),
			name: nameMatch[1].trim(),
			command: cmdMatch ? cmdMatch[1].trim() : "",
			transport: transMatch ? transMatch[1].trim() : "stdio",
			args
		});
	}
	return servers;
}
function serializeMcpEntry(srv) {
	const lines = [
		"- id: mcp-" + srv.name,
		"  name: '@deepseek-ai/dsh-mcp-client'",
		"  config:",
		"    serverName: " + srv.name,
		"    transport: " + (srv.transport || "stdio"),
		"    command: " + srv.command
	];
	if (srv.args && srv.args.length > 0) {
		lines.push("    args:");
		for (const a of srv.args) lines.push("      - " + (a.includes(" ") || a.includes("@") ? JSON.stringify(a) : a));
	} else lines.push("    args: []");
	return lines.join("\n");
}
function apply(ctx) {
	const patchFile = path.join(os.homedir(), ".dsh", "cordis.patch.yml");
	const readServers = () => {
		if (!fs.existsSync(patchFile)) return [];
		return parseMcpPatch(fs.readFileSync(patchFile, "utf8"));
	};
	const saveServers = (servers) => {
		let nonMcp = "";
		if (fs.existsSync(patchFile)) nonMcp = fs.readFileSync(patchFile, "utf8").split(/(?=^-\s+id:\s*mcp-)/m).filter((p) => !p.trim().startsWith("- id: mcp-")).join("\n").trim();
		const mcpBlocks = servers.map(serializeMcpEntry).join("\n\n");
		const combined = (nonMcp ? nonMcp + "\n\n" : "") + mcpBlocks + "\n";
		fs.writeFileSync(patchFile, combined, "utf8");
	};
	ctx.webServer.register({
		kind: "exact",
		path: "/api/local/mcp",
		handler: async (req, res) => {
			res.setHeader("Content-Type", "application/json");
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}
			if (req.method === "GET") {
				try {
					const servers = readServers();
					res.writeHead(200);
					res.end(JSON.stringify({
						ok: true,
						servers
					}));
				} catch (err) {
					res.writeHead(500);
					res.end(JSON.stringify({
						ok: false,
						error: String(err?.message || err)
					}));
				}
				return;
			}
			if (req.method === "POST") {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk;
				});
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const name = String(data.name || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
						const command = String(data.command || "").trim();
						const transport = data.transport === "streamable-http" ? "streamable-http" : "stdio";
						let args = data.args;
						if (!name || !command) {
							res.writeHead(400);
							res.end(JSON.stringify({
								ok: false,
								error: "Nama dan perintah wajib diisi."
							}));
							return;
						}
						if (typeof args === "string") args = args.split(/\s+/).filter(Boolean);
						else if (!Array.isArray(args)) args = [];
						const servers = readServers();
						const idx = servers.findIndex((s) => s.name === name);
						const entry = {
							id: "mcp-" + name,
							name,
							transport,
							command,
							args
						};
						if (idx >= 0) servers[idx] = entry;
						else servers.push(entry);
						saveServers(servers);
						res.writeHead(200);
						res.end(JSON.stringify({
							ok: true,
							server: entry
						}));
					} catch (err) {
						res.writeHead(500);
						res.end(JSON.stringify({
							ok: false,
							error: String(err?.message || err)
						}));
					}
				});
				return;
			}
			if (req.method === "DELETE") {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk;
				});
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const name = String(data.name || "").trim();
						if (!name) {
							res.writeHead(400);
							res.end(JSON.stringify({
								ok: false,
								error: "Nama server tidak valid."
							}));
							return;
						}
						saveServers(readServers().filter((s) => s.name !== name));
						res.writeHead(200);
						res.end(JSON.stringify({ ok: true }));
					} catch (err) {
						res.writeHead(500);
						res.end(JSON.stringify({
							ok: false,
							error: String(err?.message || err)
						}));
					}
				});
				return;
			}
			res.writeHead(405);
			res.end(JSON.stringify({
				ok: false,
				error: "Method Not Allowed"
			}));
		}
	});
}
//#endregion
export { apply, inject };
