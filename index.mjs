
import mhtml2html from 'mhtml2html';
import {JSDOM} from 'jsdom';
import pkg from 'puppeteer';
import fs from 'fs';
import path from 'path';
import PDFMerger from 'pdf-merger-js';
import { PDFDocument } from 'pdf-lib'
// import merger from '@hugojosefson/merge-html'
const puppeteer = pkg
const args = process.argv;
const src = path.resolve(args[2]);
const dest = path.resolve(args[3]);
const buildsrc = `${src}`;
const builddest = `${dest}`;
let tocObj = [];
const htmls = [];
convertFiles(buildsrc, builddest);

async function combinePDFs(pathToPdfs) {
  let dirs = fs.readdirSync(pathToPdfs, { withFileTypes: true });
  dirs = dirs.filter((dir) => path.extname(dir.name) == ".pdf");
  dirs.sort((a, b) => {
    const start = Number(a?.name?.split("_")[0]);
    const end = Number(b?.name?.split("_")[0]);
    if (start > end) {
      return 1;
    }
    if (start < end) {
      return -1;
    }
    if (end === start) {
      return 0;
    }
  });

  const merger = new PDFMerger();

  await Promise.all(
    dirs.map(async (entry) => {
      const filepath = path.join(pathToPdfs, entry.name);
      return await merger.add(filepath);
    })
  );
  await merger.save(pathToPdfs + "/merged.pdf");
}
async function htmlTOPDf(html, dest) {
  // launch a new chrome instance
  const browser = await puppeteer.launch({
    headless: true,
  });

  // create a new page
  const page = await browser.newPage();

  // set your html as the pages content
  await page.setContent(html, {
    waitUntil: "networkidle0",
  });

  const obj = await page.evaluate((_) => {
    const summary = document.querySelector(".summary");
    const firstHeaderObj = summary.querySelector("h1");
    const children = [];
    


    if (firstHeaderObj) {
      firstHeaderObj.id = firstHeaderObj?.textContent.replaceAll(" ", "");
    }

    summary.querySelectorAll("a[href]").forEach((a) => {
      const id = (a?.href || "").split("#")[1];
      children.push({
        id,
        name: a.textContent,
      });
      a.href = "#" + id;
    });
    document.querySelectorAll("a[href]").forEach((a) => {
      const id = (a?.href || "").split("#")[1];
      a.href = "#" + id;
    });


    return {
      chapter: {
        id: firstHeaderObj.id,
        name: firstHeaderObj.textContent,
      },
      children,
    };
  });

  tocObj.push(obj);

  await page.pdf({
    // displayHeaderFooter: true,
    margin: { top: "1.5cm", bottom: "1.5cm" },
    format: "A4",
    path: dest,
  });

  // close the browser
  return await browser.close();
}

async function createTableOfContentFile(tocDetails, dest) {
  const browser = await puppeteer.launch({
    headless: true,
  });

  // create a new page
  const page = await browser.newPage();

  const obj = await page.evaluate(function (tocDetails) {    
    for (let i = 0; i < tocDetails.length; i++) {
      const chapterInfo = tocDetails[i];
      const mainDiv = document.createElement("div");
      
      const chapterAnchor = document.createElement("a");
      chapterAnchor.textContent = chapterInfo?.chapter?.name;
      chapterAnchor.href = `#${chapterInfo?.chapter?.id}`;
      chapterInfo?.children?.forEach((section) => {
        const sectionAnchor = document.createElement("a");
        sectionAnchor.textContent = section?.name;
        sectionAnchor.href = `#${section?.id}`;
        mainDiv.insertAdjacentElement("beforeend", sectionAnchor);
      });
      mainDiv.insertAdjacentElement("beforeend", chapterAnchor);
      document.body.insertAdjacentElement("beforeend", mainDiv)
    }
    return document.body.outerHTML
    
  }, tocDetails);

  await page.pdf({
    displayHeaderFooter: true,
    margin: { top: "1.5cm", bottom: "1.5cm" },
    format: "A4",
    path: dest + "/0_table_of_content.pdf",
  });

  // close the browser
  return await browser.close();
}


async function convertFiles(src, dest) {
  if (!fs.existsSync(src)) {
    console.log("src path doesnt exists");
    return;
  }
  const isDir = fs.statSync(src).isDirectory();
  if (isDir) {
    await convertDirectory(src, dest);
    // let pdfDest = path.join(dest, "merged" + ".pdf");
    // merger(htmls)
    // await htmlTOPDf( merger(htmls), pdfDest);
    // await createTableOfContentFile(tocObj, dest)
    await combinePDFs(dest);
  } else convertFile(src, dest);
}

async function convertFile(source, destination) {
  await htmlTOPDf(source, destination);
  console.log(`Copied file from ${source} to ${destination}`);
}

async function convertDirectory(source, destination) {
  try {
    fs.mkdirSync(destination, { recursive: true });
    const dirs = fs.readdirSync(source, { withFileTypes: true });
    for (let i in dirs) {
      const entry = dirs[i];
      if (path.extname(entry.name) !== ".mhtml") {
        continue;
      }
      let sourcePath = path.join(source, entry.name);
      const basename = path.basename(entry.name, path.extname(entry.name));
      let pdfDest = path.join(dest, basename+ ".pdf");
      if (entry.isDirectory()) {
        convertDirectory(sourcePath, destinationPath);
      } else {
        const mhtml = fs.readFileSync(sourcePath, { encoding: "utf8" });
        const htmlobj = mhtml2html.convert(mhtml, {
          parseDOM: (html) => new JSDOM(html),
        });
        const html = htmlobj.serialize();
        // htmls.push(html)
        await htmlTOPDf(html, pdfDest)
      }
    }
  } catch (e) {
    console.log("error occurerd", e);
  }
}