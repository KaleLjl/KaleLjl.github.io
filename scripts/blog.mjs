#!/usr/bin/env node
/**
 * 博客一站式脚本
 * 用法（blog.sh 是薄封装，也可 npm run blog -- <命令>）：
 *   add <文件/目录...>   把文章拷进 inbox/
 *   check                干跑：报告 YAML 问题、媒体处理计划，不改动任何文件
 *   build                检查 → 媒体搬入 → 文章移入 posts → npm run build（不推线上）
 *   publish              build 全流程 + git commit + git push
 *   preview              构建 + 本地预览（和线上一致）
 *   dev                  npm run dev（写草稿时用，实时刷新）
 */
import { execSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INBOX = join(ROOT, 'inbox');
const POSTS = join(ROOT, 'src/content/posts');
const ASSETS = join(ROOT, 'src/assets');
const PUBLIC_MEDIA = join(ROOT, 'public/media');

const TODAY = new Date().toISOString().slice(0, 10);
const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

const c = {
	g: (s) => `\x1b[32m${s}\x1b[0m`,
	y: (s) => `\x1b[33m${s}\x1b[0m`,
	r: (s) => `\x1b[31m${s}\x1b[0m`,
	b: (s) => `\x1b[1m${s}\x1b[0m`,
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function die(msg) {
	console.error(c.r(`\n✘ ${msg}`));
	process.exit(1);
}
function sh(cmd, { capture = false } = {}) {
	return execSync(cmd, {
		cwd: ROOT,
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
	}).trim();
}
function ensure(dir) {
	mkdirSync(dir, { recursive: true });
	return dir;
}

/* ---------- frontmatter ---------- */

function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!m) return { fm: null, fmText: '', body: text };
	const fm = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
		if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
	}
	return { fm, fmText: m[0], body: text.slice(m[0].length) };
}

/** 近似 github-slugger：小写、空格转 -、删标点。仅用于展示预览。 */
function previewSlug(name) {
	return name
		.replace(/\.(md|mdx)$/i, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\p{L}\p{N}-]+/gu, '');
}

/* ---------- 媒体引用扫描 ---------- */

const REF_PATTERNS = [
/!\[[^\]]*\]\(\s*<?([^)]+?)>?\s*(?:"[^"]*")?\s*\)/g, // ![alt](url)，URL 可含空格（Obsidian 风格）
	/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
	/<(?:video|audio|source|embed|track)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
];

function collectRefs(fm, body) {
	const refs = [];
	for (const re of REF_PATTERNS) {
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(body))) refs.push(m[1]);
	}
	if (fm?.heroImage) refs.push(fm.heroImage);
	return [...new Set(refs)];
}

/** 把一个引用分类：skip（已合规）/ remote（需下载）/ local（需复制）/ missing（找不到）/ public（public 绝对路径） */
function classifyRef(ref, mdDir) {
	if (/^https?:\/\//i.test(ref)) return { kind: 'remote', url: ref };
	if (/^\/\//.test(ref)) return { kind: 'remote', url: `https:${ref}` };
	if (ref.startsWith('/')) {
		// 先按文件系统绝对路径识别（如 /Users/... 的本地图片引用）
		if (existsSync(ref)) return { kind: 'local', local: ref };
		const local = join(ROOT, 'public', ref.replace(/^\//, ''));
		return existsSync(local)
			? { kind: 'skip', reason: '已在 public/' }
			: { kind: 'missing', reason: `public${ref} 不存在` };
	}
	if (/^(\.\.\/)+assets\//.test(ref) || /^\.\/assets\//.test(ref)) {
		const local = resolve(mdDir, ref);
		return existsSync(local)
			? { kind: 'skip', reason: '已在 src/assets/' }
			: { kind: 'missing', reason: `${ref} 在 src/assets/ 找不到` };
	}
	if (/^(mailto|data):/i.test(ref)) return { kind: 'skip', reason: '' };
	const local = resolve(mdDir, ref);
	return existsSync(local) ? { kind: 'local', local } : { kind: 'missing', reason: `本地找不到 ${ref}` };
}

/** 生成不冲突的目标路径（内容相同则复用原名） */
function uniqueTarget(dir, name, sourceFile) {
	let target = join(dir, name);
	if (existsSync(target)) {
		try {
			if (readFileSync(target).equals(readFileSync(sourceFile))) return { target, reused: true };
		} catch {
			/* 下载场景 sourceFile 可能还没落盘，走重命名分支 */
		}
		const ext = extname(name);
		const stem = name.slice(0, -ext.length);
		for (let i = 2; ; i++) {
			target = join(dir, `${stem}-${i}${ext}`);
			if (!existsSync(target)) break;
		}
	}
	return { target, reused: false };
}

function extFromUrl(url, contentType) {
	const m = url.split('?')[0].match(/\.([A-Za-z0-9]+)$/);
	if (m) return `.${m[1].toLowerCase()}`;
	const map = {
		'image/jpeg': '.jpg',
		'image/png': '.png',
		'image/webp': '.webp',
		'image/gif': '.gif',
		'image/avif': '.avif',
		'image/svg+xml': '.svg',
		'video/mp4': '.mp4',
		'video/webm': '.webm',
		'audio/mpeg': '.mp3',
	};
	return map[(contentType || '').split(';')[0].trim()] || null;
}

async function fetchToFile(url, dir) {
	let res;
	try {
		res = await fetch(url);
	} catch (e) {
		throw new Error(`下载失败（网络）：${url}\n  ${e.message}`);
	}
	if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）：${url}`);
	const buf = Buffer.from(await res.arrayBuffer());
	let name = decodeURIComponent(basename(url.split('?')[0].split('#')[0])) || 'download';
	const ct = res.headers.get('content-type') || '';
	let ext = extname(name) ? extname(name).toLowerCase() : extFromUrl(url, ct);
	if (!ext) throw new Error(`无法判断文件类型（content-type: ${ct || '未知'}）：${url}`);
	name = name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || `media${ext}`;
	if (!extname(name)) name += ext;
	const tmp = join(dir, `.tmp-${Date.now()}-${name}`);
	writeFileSync(tmp, buf);
	return { tmp, name };
}

/* ---------- 单篇文章：检查 ---------- */

function checkPost(mdPath) {
	const problems = []; // 阻断性
	const warnings = []; // 提醒但不阻断
	const autoFixes = []; // 将自动补上
	const raw = readFileSync(mdPath, 'utf8');
	const { fm, body } = parseFrontmatter(raw);
	const fileName = basename(mdPath);
	const slug = previewSlug(fileName);

	if (!fm) {
		problems.push(`缺 frontmatter。在文件开头补：\n\n  ---\n  description: 一句话摘要（用于 SEO 和 RSS）\n  pubDate: ${TODAY}\n  ---`);
		const refs0 = collectRefs(null, body).map((ref) => ({ ref, ...classifyRef(ref, dirname(mdPath)) }));
		for (const r of refs0) if (r.kind === 'missing') warnings.push(`媒体找不到：${r.ref}（${r.reason}）`);
		if (/^#\s+\S/m.test(body)) warnings.push('正文里有 # 一级标题，会和页面大标题（文件名）重复，建议删掉正文的这行');
		return { mdPath, fileName, slug, fm: null, raw, body, problems, warnings, autoFixes, refs: refs0 };
	}
	if (!fm.description?.trim()) {
		problems.push(`缺 description。示例：\n  description: ${body.trim().split(/\r?\n/)[0]?.slice(0, 40) || '一句话摘要，写给人看也给搜索引擎看'}…`);
	}
	if (!fm.pubDate) {
		autoFixes.push(`缺 pubDate → 自动补今天（${TODAY}）`);
	} else if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.pubDate) || Number.isNaN(Date.parse(fm.pubDate))) {
		problems.push(`pubDate 格式不对（${fm.pubDate}），必须是 YYYY-MM-DD，如 ${TODAY}`);
	}
	for (const f of ['updatedDate'])
		if (fm[f] && !/^\d{4}-\d{2}-\d{2}$/.test(fm[f]))
			problems.push(`${f} 格式不对（${fm[f]}），必须是 YYYY-MM-DD`);
	if (fm.draft && fm.draft !== 'true' && fm.draft !== 'false')
		problems.push(`draft 只能是 true / false（当前：${fm.draft}）`);
	if (fm.draft === 'true') warnings.push('draft: true → 只在本地可见，不会进线上构建');

	// 文件名 → 标题/URL 预览
	const displayTitle = fm.title || slug;
	if (/^#\s+\S/m.test(body))
		warnings.push('正文里有 # 一级标题，会和页面大标题（文件名）重复，建议删掉正文的这行');
	if (!fm.title && fileName !== `${slug}.md` && fileName !== `${slug}.mdx`)
		warnings.push(`文件名里的标点/空格不会出现在标题和 URL 里 → 标题将是「${displayTitle}」。想保留标点就加 title 字段`);
	if (existsSync(join(POSTS, fileName))) problems.push(`src/content/posts/ 已有同名文件 ${fileName}`);

	// 媒体
	const mdDir = dirname(mdPath);
	const refs = collectRefs(fm, body).map((ref) => ({ ref, ...classifyRef(ref, mdDir) }));
	for (const r of refs) if (r.kind === 'missing') warnings.push(`媒体找不到：${r.ref}（${r.reason}）`);

	return { mdPath, fileName, slug, fm, raw, body, problems, warnings, autoFixes, refs };
}

function report(posts) {
	let blocked = false;
	for (const p of posts) {
		console.log(`\n📄 ${c.b(p.fileName)}  ${c.dim(`→ /posts/${p.slug}/`)}`);
		for (const f of p.autoFixes) console.log(`  ${c.y('⚠')}  ${f}`);
		for (const w of p.warnings) console.log(`  ${c.y('⚠')}  ${w}`);
		for (const pr of p.problems) {
			blocked = true;
			console.log(`  ${c.r('✘')}  ${pr}`);
		}
		const media = p.refs || [];
		if (media.length) {
			const parts = media.map((r) => {
				if (r.kind === 'remote') return `${c.y('下载')} ${r.ref}`;
				if (r.kind === 'local') return `${c.y('复制')} ${r.ref}`;
				if (r.kind === 'skip') return `${c.g('OK')} ${r.ref} ${c.dim(r.reason)}`;
				return `${c.r('缺失')} ${r.ref}`;
			});
			console.log(`  🖼️  媒体 ${media.length} 项：`);
			for (const x of parts) console.log(`     ${x}`);
		} else {
			console.log(`  ${c.dim('媒体：无')}`);
		}
	}
	return blocked;
}

/* ---------- 单篇文章：落盘（补字段 + 媒体 + 移动） ---------- */

async function processPost(p, { moved }) {
	let text = p.raw;

	// 1. 补 pubDate
	if (p.fm && !p.fm.pubDate) text = text.replace(/^---\r?\n/, `---\npubDate: ${TODAY}\n`);

	// 2. 媒体
	const mdDir = dirname(p.mdPath);
	for (const r of p.refs) {
		if (r.kind !== 'remote' && r.kind !== 'local') continue;
		const isRemote = r.kind === 'remote';
		let tmp = null;
		let name;
		try {
			if (isRemote) {
				const dl = await fetchToFile(r.url, INBOX);
				tmp = dl.tmp;
				name = dl.name;
			} else {
				name = basename(r.local);
			}
			const srcFile = isRemote ? tmp : r.local;
			// 空格等字符会破坏 Markdown 图片语法，统一清洗
			name = name.replace(/\s+/g, '-');
			const ext = extname(name).toLowerCase();
			const isImg = IMG_EXTS.has(ext);
			const dir = isImg ? ensure(ASSETS) : ensure(PUBLIC_MEDIA);
			const { target } = uniqueTarget(dir, name, srcFile);
			copyFileSync(srcFile, target);
			if (isRemote) rmSync(tmp);
			else if (r.local.startsWith(INBOX)) moved.push(r.local); // inbox 里的源文件稍后清理
			const finalName = basename(target);
			const newPath = isImg ? `../../assets/${finalName}` : `/media/${finalName}`;
			text = text.split(r.ref).join(newPath);
			console.log(`  ${c.g('✓')} ${isRemote ? '下载' : '复制'} ${r.ref} → ${newPath}`);
		} catch (e) {
			if (tmp && existsSync(tmp)) rmSync(tmp);
			throw e;
		}
	}

	// 3. heroImage 若还是相对路径，统一成 ../../assets/ 形式
	const fm2 = parseFrontmatter(text).fm;
	if (fm2?.heroImage && !/^(https?:|\/)/.test(fm2.heroImage) && !/^(\.\.\/)+assets\//.test(fm2.heroImage)) {
		const local = resolve(mdDir, fm2.heroImage);
		if (existsSync(local) && local.startsWith(ASSETS))
			text = text.replace(/^(heroImage\s*:\s*)(.+)$/m, `$1../../assets/${basename(local)}`);
	}

	// 4. 移入 posts
	const dest = join(POSTS, p.fileName);
	writeFileSync(dest, text);
	moved.push(p.mdPath);
	return dest;
}

/* ---------- 命令 ---------- */

function collectInboxPosts() {
	if (!existsSync(INBOX)) return [];
	const out = [];
	(function walk(dir) {
		for (const e of readdirSync(dir)) {
			const full = join(dir, e);
			if (statSync(full).isDirectory()) walk(full);
			else if (/\.(md|mdx)$/i.test(e)) out.push(full);
		}
	})(INBOX);
	return out;
}

async function cmdCollect(paths) {
	ensure(INBOX);
	for (const p of paths) {
		const abs = resolve(p);
		if (!existsSync(abs)) die(`找不到 ${p}`);
		const stat = statSync(abs);
		const dest = join(INBOX, basename(abs));
		if (stat.isDirectory()) {
			execSync(`cp -R ${JSON.stringify(abs)} ${JSON.stringify(dest)}`);
			console.log(`${c.g('✓')} 目录已收进 inbox/${basename(abs)}/`);
		} else {
			copyFileSync(abs, dest);
			console.log(`${c.g('✓')} 已收进 inbox/${basename(abs)}`);
		}
	}
	console.log(c.dim('\n下一步：./blog.sh check'));
}

function cmdDev() {
	execSync('npm run dev', { cwd: ROOT, stdio: 'inherit' });
}

function cmdPreview() {
	console.log(c.b('\n▶ 构建…'));
	execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
	console.log(c.b('\n▶ 启动预览 http://localhost:4321（Ctrl-C 退出）'));
	execSync('npm run preview', { cwd: ROOT, stdio: 'inherit' });
}

async function runPipeline({ push = false, dry = false }) {
	const mdFiles = collectInboxPosts();
	const hasGitChanges = (() => {
		try {
			return sh('git status --porcelain', { capture: true }) !== '';
		} catch {
			return false;
		}
	})();

	// inbox 空：直接发布未推送的变更（比如上次试发的产物）
	if (mdFiles.length === 0) {
		if (!push || dry) die('inbox/ 里没有文章。把 .md 放进去再运行（或先 ./blog.sh add <文件>）');
		if (!hasGitChanges) die('inbox/ 是空的，也没有待发布的改动。把 .md 文章放进 inbox/ 再来。');
		console.log(c.dim('inbox/ 为空，但检测到未发布的改动 → 直接推送'));
		gitPublish('chore: 更新');
		return;
	}

	console.log(c.b(`\n▶ 检查 ${mdFiles.length} 篇文章…`));
	const posts = mdFiles.map(checkPost);
	const blocked = report(posts);
	if (blocked) die('以上 ✘ 项需要先修复，文章都还在 inbox/ 里没动。');

	if (dry) {
		console.log(c.dim('\n（检查模式：以上为完整计划，未改动任何文件）'));
		return;
	}

	// 落盘
	const movedFiles = [];
	const dests = [];
	console.log(c.b('\n▶ 处理媒体、写入文章…'));
	for (const p of posts) {
		try {
			dests.push(await processPost(p, { moved: movedFiles }));
		} catch (e) {
			// 回滚已处理的
			for (const f of movedFiles) if (!f.startsWith(ASSETS) && !f.startsWith(PUBLIC_MEDIA)) try { rmSync(f); } catch {}
			die(`处理 ${p.fileName} 失败：${e.message}\n已中止，已写入的文件已退回。`);
		}
	}

	// 构建
	console.log(c.b('\n▶ 构建…'));
	try {
		execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
	} catch {
		for (const d of dests) {
			const back = join(INBOX, basename(d));
			copyFileSync(d, back);
			rmSync(d);
		}
		die('构建失败。文章已退回 inbox/（媒体已留在 assets/，不影响重试）。修好后重新运行即可。');
	}

	// 清理 inbox 中已搬走的源文件
	for (const f of movedFiles) if (existsSync(f)) rmSync(f);
	const remain = collectInboxPosts();
	console.log(`\n${c.g('✓')} ${dests.length} 篇已就位：`);
	for (const d of dests) console.log(`   ${relative(ROOT, d)}`);
	if (remain.length) console.log(c.y(`⚠ inbox/ 里还有 ${remain.length} 篇未处理（可能有同名冲突）`));

	if (!push) {
		console.log(c.g('\n✓ build 完成，本地构建通过。确认没问题后：./blog.sh publish'));
		return;
	}
	gitPublish(`post: ${posts.map((p) => p.fm?.title || p.slug).join('、')}`);
}

function gitPublish(msg) {
	console.log(c.b('\n▶ 提交并推送…'));
	try {
		execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
		try {
			execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: ROOT, stdio: 'inherit' });
		} catch {
			console.log(c.dim('没有可提交的变更'));
		}
		execSync('git push', { cwd: ROOT, stdio: 'inherit' });
		console.log(c.g('\n✓ 已推送！约 1-2 分钟后线上生效：https://kaleljl.github.io'));
	} catch (e) {
		die(`git 推送失败（网络/权限？）。代码已 commit，稍后手动跑：git push\n  ${e.message.split('\n')[0]}`);
	}
}

/* ---------- main ---------- */

const [cmd, ...args] = process.argv.slice(2);
const HELP = `用法：
  ./blog.sh add <文件或目录...>   把文章拷进 inbox/（图片在文章旁边的会一起带上）
  ./blog.sh check               检查 inbox/ 的文章：YAML 缺什么、媒体怎么处理（不改文件）
  ./blog.sh build               检查 → 媒体下载/复制 → 文章入位 → 构建验证（不上线）
  ./blog.sh publish             build 全流程 + git commit + push
  ./blog.sh preview             构建 + 本地预览（与线上一致）
  ./blog.sh dev                 开发模式（写文章时实时预览）`;

switch (cmd) {
	case 'add':
		args.length ? await cmdCollect(args) : die('用法：./blog.sh add <文件或目录...>');
		break;
	case 'check':
		await runPipeline({ dry: true });
		break;
	case 'build':
	case 'stage':
		await runPipeline({});
		break;
	case 'publish':
		await runPipeline({ push: true });
		break;
	case 'preview':
		cmdPreview();
		break;
	case 'dev':
		cmdDev();
		break;
	default:
		console.log(HELP);
		process.exit(cmd ? 1 : 0);
}
