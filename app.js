"use strict";

const $ = (id) => document.getElementById(id);
let qtiState = null;
let wordState = null;

function setMode(mode){
  const qti = mode === "qti";
  $("qti-panel").hidden = !qti; $("word-panel").hidden = qti;
  $("mode-qti").classList.toggle("active", qti); $("mode-word").classList.toggle("active", !qti);
  $("mode-qti").setAttribute("aria-pressed", qti); $("mode-word").setAttribute("aria-pressed", !qti);
}
$("mode-qti").onclick=()=>setMode("qti"); $("mode-word").onclick=()=>setMode("word");

function localChildren(el,name){return [...el.children].filter(x=>x.localName===name)}
function descendants(el,name){return [...el.getElementsByTagNameNS("*",name)]}
function first(el,name){return descendants(el,name)[0]||null}
function text(el){return el?.textContent?.trim()||""}
function escapeXml(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
function escapeHtml(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function stripHtml(html){const d=document.createElement("div");d.innerHTML=html;return (d.textContent||"").replace(/\u00a0/g," ").replace(/\n{3,}/g,"\n\n").trim()}
function uid(prefix="g"){return prefix+crypto.getRandomValues(new Uint32Array(4)).reduce((a,n)=>a+n.toString(16).padStart(8,"0"),"").slice(0,32)}
function parseXml(s){const d=new DOMParser().parseFromString(s,"application/xml");const e=d.querySelector("parsererror");if(e)throw new Error("The package contains XML that could not be read.");return d}

function metadata(item,label){
  for(const f of descendants(item,"qtimetadatafield")){if(text(first(f,"fieldlabel"))===label)return text(first(f,"fieldentry"))}
  return "";
}
function firstDirectMaterialText(item){
  const presentation=first(item,"presentation"); if(!presentation)return "";
  for(const child of presentation.children){if(child.localName==="material"){const mt=first(child,"mattext");if(mt)return text(mt)}}
  return "";
}
function parseItem(item,index){
  const rawType=metadata(item,"question_type")||"unknown";
  const typeMap={multiple_choice_question:"multiple_choice",multiple_answers_question:"multiple_answer",true_false_question:"true_false",essay_question:"essay",short_answer_question:"short_answer",text_only_question:"text_only"};
  const type=typeMap[rawType]||rawType;
  const stemHtml=firstDirectMaterialText(item);
  const choices=[];
  for(const label of descendants(item,"response_label")){
    const mt=first(label,"mattext");choices.push({id:label.getAttribute("ident")||uid("a"),text:text(mt),correct:false});
  }
  const correctIds=new Set();
  for(const condition of descendants(item,"respcondition")){
    const setvar=first(condition,"setvar");
    if(setvar && Number(text(setvar))>0){for(const v of descendants(condition,"varequal"))correctIds.add(text(v))}
  }
  choices.forEach(c=>c.correct=correctIds.has(c.id));
  let feedback=""; const fb=first(item,"itemfeedback"); if(fb)feedback=text(first(fb,"mattext"));
  return {number:index+1,id:item.getAttribute("ident")||uid(),title:item.getAttribute("title")||`Question ${index+1}`,type,rawType,points:Number(metadata(item,"points_possible")||1),stemHtml,stem:stripHtml(stemHtml),choices,feedback,correctText:[...correctIds],supported:Object.values(typeMap).includes(type)};
}

async function readQti(file){
  const zip=await JSZip.loadAsync(file); let assessment=null, assessmentPath=""; const warnings=[];
  for(const [path,entry] of Object.entries(zip.files)){
    if(entry.dir||!path.toLowerCase().endsWith(".xml"))continue;
    const xml=await entry.async("string");
    if(xml.includes("<questestinterop")&&xml.includes("<assessment")){assessment=parseXml(xml);assessmentPath=path;break}
  }
  if(!assessment)throw new Error("No QTI 1.2 assessment was found in this ZIP package.");
  const assessmentEl=first(assessment,"assessment");
  const title=assessmentEl?.getAttribute("title")||file.name.replace(/\.zip$/i,"");
  const items=descendants(assessmentEl,"item").map(parseItem);
  const groupSections=descendants(assessmentEl,"section").filter(s=>first(s,"sourcebank_ref"));
  groupSections.forEach(s=>warnings.push(`Question group “${s.getAttribute("title")||"Untitled group"}” references bank ${text(first(s,"sourcebank_ref"))}; bank questions were not present in this assessment file.`));
  items.filter(q=>!q.supported).forEach(q=>warnings.push(`Question ${q.number} uses unsupported type “${q.rawType}” and is included as review text only.`));
  return {title,items,warnings,assessmentPath};
}

function renderQuestions(target,items){
  target.innerHTML=items.map(q=>`<article class="question"><div class="question-head"><strong>Question ${q.number}</strong><span>${escapeHtml(labelType(q.type))} · ${q.points} point${q.points===1?"":"s"}</span></div><div class="stem">${escapeHtml(q.stem).replace(/\n/g,"<br>")||"<em>No question text found</em>"}</div>${q.choices.map((c,i)=>`<div class="choice ${c.correct?"correct":""}">${String.fromCharCode(65+i)}. ${escapeHtml(c.text)}${c.correct?' <span class="sr-only">(correct)</span> ✓':""}</div>`).join("")}${q.feedback?`<div><strong>Feedback:</strong> ${escapeHtml(stripHtml(q.feedback))}</div>`:""}</article>`).join("");
}
function labelType(t){return ({multiple_choice:"Multiple choice",multiple_answer:"Multiple answer",true_false:"True/False",essay:"Essay",short_answer:"Short answer",text_only:"Directions"})[t]||t}

async function handleQti(file){
  $("qti-status").className="status"; $("qti-status").textContent="Reading QTI package…";
  try{qtiState=await readQti(file);$("qti-status").textContent="Package read successfully.";$("qti-summary").innerHTML=`<strong>${escapeHtml(qtiState.title)}</strong><br>${qtiState.items.length} question item${qtiState.items.length===1?"":"s"} found.`;renderQuestions($("qti-preview"),qtiState.items);$("qti-warnings").hidden=!qtiState.warnings.length;$("qti-warnings").innerHTML=qtiState.warnings.length?`<strong>Review required</strong><ul>${qtiState.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join("")}</ul>`:"";$("qti-results").hidden=false}
  catch(e){$("qti-status").className="status error";$("qti-status").textContent=e.message;$("qti-results").hidden=true}
}

function paragraphXml(value,style=""){
  const lines=String(value??"").split("\n"); const runs=[];
  lines.forEach((line,i)=>{if(i)runs.push("<w:r><w:br/></w:r>");runs.push(`<w:r>${style?`<w:rPr>${style}</w:rPr>`:""}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)});
  return `<w:p>${runs.join("")}</w:p>`;
}
function makeDocumentXml(title,items,template=false){
  const body=[paragraphXml(title,"<w:b/><w:sz w:val=\"36\"/>")];
  body.push(paragraphXml(template?"Complete the fields below. Keep bracketed markers intact. Mark correct choices with an asterisk (*).":"Generated from Canvas QTI. Edit using the structured markers to convert this document back to QTI."));
  items.forEach((q,i)=>{
    body.push(paragraphXml("[[QUESTION]]","<w:b/>"));
    body.push(paragraphXml(`Type: ${labelType(q.type)}`));
    body.push(paragraphXml(`Points: ${q.points}`));
    body.push(paragraphXml(`Title: ${q.title||`Question ${i+1}`}`));
    body.push(paragraphXml("Stem:")); body.push(paragraphXml(q.stem));
    if(["multiple_choice","multiple_answer","true_false"].includes(q.type)){
      body.push(paragraphXml("Choices:"));q.choices.forEach((c,j)=>body.push(paragraphXml(`${c.correct?"*":""}${String.fromCharCode(97+j)}. ${c.text}`)));
    }else if(q.type==="short_answer"){
      body.push(paragraphXml(`Answer: ${q.answers?.join(" | ")||""}`));
    }
    body.push(paragraphXml(`Feedback: ${stripHtml(q.feedback||"")}`));
    body.push(paragraphXml("[[END QUESTION]]","<w:b/>"));
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`;
}
async function makeDocx(title,items,template=false){
  const zip=new JSZip();zip.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);zip.folder("_rels").file(".rels",`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);zip.folder("word").file("document.xml",makeDocumentXml(title,items,template));return zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function safeName(s){return s.replace(/[^a-z0-9]+/gi,"_").replace(/^_|_$/g,"")||"quiz"}

async function docxParagraphs(file){
  const zip=await JSZip.loadAsync(file);const entry=zip.file("word/document.xml");if(!entry)throw new Error("This does not appear to be a valid Word .docx file.");const doc=parseXml(await entry.async("string"));
  return descendants(doc,"p").map(p=>descendants(p,"t").map(t=>t.textContent).join("")).map(s=>s.trim());
}
function normalizeType(v){const x=v.toLowerCase().replace(/[^a-z]+/g," ").trim();return ({"multiple choice":"multiple_choice","multiple answer":"multiple_answer","true false":"true_false","essay":"essay","short answer":"short_answer","directions":"text_only","text only":"text_only"})[x]||x.replace(/ /g,"_")}
function parseTemplate(lines){
  const items=[],errors=[];let start=-1;
  for(let i=0;i<=lines.length;i++){
    if(lines[i]==="[[QUESTION]]")start=i+1;
    if(lines[i]==="[[END QUESTION]]"&&start>=0){
      const block=lines.slice(start,i);const q={number:items.length+1,title:"",type:"",points:1,stem:"",stemHtml:"",choices:[],answers:[],feedback:"",supported:true};let mode="";
      for(const line of block){
        if(/^Type:/i.test(line)){q.type=normalizeType(line.replace(/^Type:\s*/i,""));mode=""}
        else if(/^Points:/i.test(line)){q.points=Number(line.replace(/^Points:\s*/i,""));mode=""}
        else if(/^Title:/i.test(line)){q.title=line.replace(/^Title:\s*/i,"").trim();mode=""}
        else if(/^Stem:/i.test(line)){mode="stem";const v=line.replace(/^Stem:\s*/i,"");if(v)q.stem=v}
        else if(/^Choices:/i.test(line)){mode="choices"}
        else if(/^Answer:/i.test(line)){q.answers=line.replace(/^Answer:\s*/i,"").split("|").map(x=>x.trim()).filter(Boolean);mode=""}
        else if(/^Feedback:/i.test(line)){q.feedback=line.replace(/^Feedback:\s*/i,"");mode="feedback"}
        else if(mode==="choices"&&/^\*?[a-z]\./i.test(line)){const correct=line.startsWith("*");q.choices.push({id:uid("a"),text:line.replace(/^\*?[a-z]\.\s*/i,""),correct})}
        else if(mode==="stem"&&line)q.stem+=(q.stem?"\n":"")+line;
        else if(mode==="feedback"&&line)q.feedback+=(q.feedback?"\n":"")+line;
      }
      q.stemHtml=escapeHtml(q.stem).replace(/\n/g,"<br>");q.title=q.title||`Question ${q.number}`;
      const allowed=["multiple_choice","multiple_answer","true_false","essay","short_answer","text_only"];
      if(!allowed.includes(q.type))errors.push(`Question ${q.number}: unsupported or missing Type.`);
      if(!q.stem)errors.push(`Question ${q.number}: missing Stem text.`);
      if(!Number.isFinite(q.points)||q.points<0)errors.push(`Question ${q.number}: Points must be zero or a positive number.`);
      if(["multiple_choice","multiple_answer","true_false"].includes(q.type)){
        if(q.choices.length<2)errors.push(`Question ${q.number}: at least two choices are required.`);
        const n=q.choices.filter(c=>c.correct).length;if(q.type==="multiple_choice"&&n!==1)errors.push(`Question ${q.number}: multiple choice requires exactly one starred answer.`);if(q.type==="multiple_answer"&&n<1)errors.push(`Question ${q.number}: multiple answer requires at least one starred answer.`);if(q.type==="true_false"&&q.choices.length!==2)errors.push(`Question ${q.number}: True/False requires exactly two choices.`);
      }
      if(q.type==="short_answer"&&!q.answers.length)errors.push(`Question ${q.number}: short answer requires at least one Answer.`);
      items.push(q);start=-1;
    }
  }
  if(start>=0)errors.push("The final question is missing [[END QUESTION]].");if(!items.length)errors.push("No complete [[QUESTION]] blocks were found.");
  return {items,errors};
}

async function handleWord(file){
  $("word-status").className="status";$("word-status").textContent="Reading Word document…";
  try{const parsed=parseTemplate(await docxParagraphs(file));wordState=parsed;$("word-status").textContent=parsed.errors.length?"Document read with validation errors.":"Document validated successfully.";$("word-summary").innerHTML=`<strong>${parsed.items.length} question item${parsed.items.length===1?"":"s"} recognized.</strong><br>${parsed.errors.length?`${parsed.errors.length} issue${parsed.errors.length===1?"":"s"} must be fixed before export.`:"Ready to create a Canvas QTI package."}`;renderQuestions($("word-preview"),parsed.items);$("word-errors").hidden=!parsed.errors.length;$("word-errors").innerHTML=parsed.errors.length?`<strong>Fix these items in Word and upload again:</strong><ul>${parsed.errors.map(e=>`<li>${escapeHtml(e)}</li>`).join("")}</ul>`:"";$("download-qti").disabled=!!parsed.errors.length;$("word-results").hidden=false}
  catch(e){$("word-status").className="status error";$("word-status").textContent=e.message;$("word-results").hidden=true}
}

function qtiMetadata(type,points,idrefs=""){return `<itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${escapeXml(type)}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${points}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>${escapeXml(idrefs)}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>assessment_question_identifierref</fieldlabel><fieldentry>${uid("g")}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>`}
function typeToCanvas(t){return ({multiple_choice:"multiple_choice_question",multiple_answer:"multiple_answers_question",true_false:"true_false_question",essay:"essay_question",short_answer:"short_answer_question",text_only:"text_only_question"})[t]}
function itemXml(q){
  const ident=uid("g"),canvasType=typeToCanvas(q.type);let presentation=`<presentation><material><mattext texttype="text/html">${escapeXml(`<div><p>${q.stemHtml}</p></div>`)}</mattext></material>`;let processing="";
  if(["multiple_choice","multiple_answer","true_false"].includes(q.type)){
    const card=q.type==="multiple_answer"?"Multiple":"Single";presentation+=`<response_lid ident="response1" rcardinality="${card}"><render_choice>${q.choices.map(c=>`<response_label ident="${c.id}"><material><mattext texttype="text/plain">${escapeXml(c.text)}</mattext></material></response_label>`).join("")}</render_choice></response_lid>`;
    const correct=q.choices.filter(c=>c.correct);const condition=q.type==="multiple_answer"?`<and>${correct.map(c=>`<varequal respident="response1">${c.id}</varequal>`).join("")}${q.choices.filter(c=>!c.correct).map(c=>`<not><varequal respident="response1">${c.id}</varequal></not>`).join("")}</and>`:`<varequal respident="response1">${correct[0]?.id||""}</varequal>`;processing=`<resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes><respcondition continue="No"><conditionvar>${condition}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>`;
  }else if(q.type==="essay"){presentation+=`<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1"/></render_fib></response_str>`}
  else if(q.type==="short_answer"){presentation+=`<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1"/></render_fib></response_str>`;processing=`<resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>${q.answers.map(a=>`<respcondition continue="No"><conditionvar><varequal respident="response1" case="No">${escapeXml(a)}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`).join("")}</resprocessing>`}
  presentation+="</presentation>";const feedback=q.feedback?`<itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html">${escapeXml(`<p>${escapeHtml(q.feedback)}</p>`)}</mattext></material></flow_mat></itemfeedback>`:"";
  return `<item ident="${ident}" title="${escapeXml(q.title)}">${qtiMetadata(canvasType,q.points,q.choices.map(c=>c.id).join(","))}${presentation}${processing}${feedback}</item>`;
}
async function makeQti(title,items){
  const aid=uid("g"),folder=aid;const assessment=`<?xml version="1.0" encoding="UTF-8"?><questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd"><assessment ident="${aid}" title="${escapeXml(title)}"><section ident="root_section">${items.map(itemXml).join("")}</section></assessment></questestinterop>`;
  const manifest=`<?xml version="1.0" encoding="UTF-8"?><manifest identifier="${uid("g")}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion></metadata><organizations/><resources><resource identifier="${aid}" type="imsqti_xmlv1p2" href="${folder}/${aid}.xml"><file href="${folder}/${aid}.xml"/></resource></resources></manifest>`;
  const zip=new JSZip();zip.file("imsmanifest.xml",manifest);zip.folder(folder).file(`${aid}.xml`,assessment);return zip.generateAsync({type:"blob",mimeType:"application/zip"});
}

function bindDrop(zoneId,inputId,handler){const z=$(zoneId),inp=$(inputId);inp.onchange=()=>inp.files[0]&&handler(inp.files[0]);["dragenter","dragover"].forEach(e=>z.addEventListener(e,x=>{x.preventDefault();z.classList.add("drag")}));["dragleave","drop"].forEach(e=>z.addEventListener(e,x=>{x.preventDefault();z.classList.remove("drag")}));z.addEventListener("drop",e=>e.dataTransfer.files[0]&&handler(e.dataTransfer.files[0]))}
bindDrop("qti-drop","qti-file",handleQti);bindDrop("word-drop","word-file",handleWord);
$("download-docx").onclick=async()=>download(await makeDocx(qtiState.title,qtiState.items),`${safeName(qtiState.title)}.docx`);
$("download-template").onclick=async()=>{const sample=[{number:1,title:"ATP Production",type:"multiple_choice",points:1,stem:"Which organelle is primarily responsible for producing ATP in a eukaryotic cell?",choices:[{text:"Nucleus",correct:false},{text:"Mitochondrion",correct:true},{text:"Ribosome",correct:false},{text:"Golgi apparatus",correct:false}],feedback:"Mitochondria generate most cellular ATP.",supported:true},{number:2,title:"AI Reflection",type:"essay",points:5,stem:"Describe one potential benefit and one potential risk of generative AI.",choices:[],feedback:"",supported:true}];download(await makeDocx("QTI Word Studio Template",sample,true),"QTI_Word_Studio_Template.docx")};
$("download-qti").onclick=async()=>{const title=$("quiz-title").value.trim()||"Imported Quiz";download(await makeQti(title,wordState.items),`${safeName(title)}_QTI.zip`)};
$("reset-qti").onclick=()=>{qtiState=null;$("qti-file").value="";$("qti-results").hidden=true;$("qti-status").textContent=""};
$("reset-word").onclick=()=>{wordState=null;$("word-file").value="";$("word-results").hidden=true;$("word-status").textContent=""};
