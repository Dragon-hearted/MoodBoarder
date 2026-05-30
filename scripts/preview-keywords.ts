#!/usr/bin/env bun
import { dirname } from "node:path";
import { analyzeImage } from "../src/analyze";
import { mergeDNAs } from "../src/dna-merge";
import { generateKeywords } from "../src/keywords";

const [, , imagePath, description, countStr] = process.argv;
if (!imagePath) {
	console.error("usage: preview-keywords.ts <image> [description] [count]");
	process.exit(1);
}

const count = countStr ? Number.parseInt(countStr, 10) : 5;

const dna = await analyzeImage(imagePath, dirname(imagePath));
const merged = mergeDNAs([dna]);

console.log("\n--- VisualDNA ---");
console.log(JSON.stringify(merged, null, 2));

const kw = await generateKeywords(merged, description, count);
console.log("\n--- Keywords ---");
kw.keywords.forEach((k, i) => console.log(`${i + 1}. ${k}`));
