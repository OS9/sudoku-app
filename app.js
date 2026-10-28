(() => {
"use strict";
const $ = id => document.getElementById(id);
const STORE = "sudoku-pwa-v1";
const RECORDS = "sudoku-records-v1";
const THEME = "sudoku-theme-v1";
const REMOVE = {easy:38, medium:48, hard:55};
const DIFF_NAMES = {easy:"初級",medium:"中級",hard:"上級"};
let game = null, selected = 40, noteMode = false, undoStack = [], startedAt = 0, elapsedBefore = 0, timerId = null, toastTimer = null;

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pattern(r,c){return (r*3+Math.floor(r/3)+c)%9;}
function makeSolution(){
  const rows=shuffle([0,1,2]).flatMap(g=>shuffle([0,1,2]).map(x=>g*3+x));
  const cols=shuffle([0,1,2]).flatMap(g=>shuffle([0,1,2]).map(x=>g*3+x));
  const nums=shuffle([1,2,3,4,5,6,7,8,9]);
  return rows.map(r=>cols.map(c=>nums[pattern(r,c)]));
}
function copyBoard(b){return b.map(row=>row.slice());}
function candidates(board,r,c){
  const used=new Set();
  for(let i=0;i<9;i++){used.add(board[r][i]);used.add(board[i][c]);}
  const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
  for(let y=br;y<br+3;y++)for(let x=bc;x<bc+3;x++)used.add(board[y][x]);
  return [1,2,3,4,5,6,7,8,9].filter(n=>!used.has(n));
}
function solve(board){
  let best=null,opts=null;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!board[r][c]){
    const o=candidates(board,r,c);if(!opts||o.length<opts.length){best=[r,c];opts=o;}if(o.length===0)return false;
  }
  if(!best)return true;
  const [r,c]=best;
  for(const n of shuffle(opts.slice())){board[r][c]=n;if(solve(board))return true;board[r][c]=0;}
  return false;
}
function generatePuzzle(difficulty){
  const solution=makeSolution(), puzzle=copyBoard(solution), cells=shuffle(Array.from({length:81},(_,i)=>i));
  let removed=0,target=REMOVE[difficulty];
  for(const idx of cells){if(removed>=target)break;const r=Math.floor(idx/9),c=idx%9,old=puzzle[r][c];puzzle[r][c]=0;
    // Keep every puzzle uniquely solvable.
    const test=copyBoard(puzzle), count=countSolutions(test,2);
    if(count!==1)puzzle[r][c]=old;else removed++;
  }
  return {solution,puzzle};
}
function countSolutions(board,limit){
  let best=null,opts=null;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!board[r][c]){
    const o=candidates(board,r,c);if(!opts||o.length<opts.length){best=[r,c];opts=o;}if(!o.length)return 0;
  }
  if(!best)return 1;
  let count=0;const [r,c]=best;
  for(const n of opts){board[r][c]=n;count+=countSolutions(board,limit-count);board[r][c]=0;if(count>=limit)return count;}
  return count;
}
function freshGame(difficulty){
  const {solution,puzzle}=generatePuzzle(difficulty);
  game={difficulty,solution,initial:copyBoard(puzzle),board:copyBoard(puzzle),notes:Array.from({length:81},()=>[]),mistakes:0,elapsed:0,finished:false};
  selected=puzzle.findIndex(row=>row.includes(0));if(selected<0)selected=40;
  undoStack=[];noteMode=false;elapsedBefore=0;startedAt=Date.now();$("notesBtn").setAttribute("aria-pressed","false");
  save();render();startTimer();setMessage("マスを選んで数字を入力");
}
function snapshot(){return JSON.stringify({board:game.board,notes:game.notes,mistakes:game.mistakes,elapsed:elapsed(),selected,noteMode});}
function pushUndo(){undoStack.push(snapshot());if(undoStack.length>100)undoStack.shift();}
function elapsed(){return elapsedBefore+(game&&!game.finished?Math.floor((Date.now()-startedAt)/1000):0);}
function fmt(sec){sec=Math.max(0,sec|0);return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");}
function save(){
  if(!game)return;
  const data={...game,elapsed:elapsed(),savedAt:Date.now(),selected,noteMode};
  try{localStorage.setItem(STORE,JSON.stringify(data));}catch(e){}
}
function load(){
  try{const raw=localStorage.getItem(STORE);if(!raw)return false;const d=JSON.parse(raw);
    if(!d||!d.board||!d.solution||!d.initial)return false;
    game=d;selected=Number.isInteger(d.selected)?d.selected:40;noteMode=!!d.noteMode;elapsedBefore=d.elapsed||0;startedAt=Date.now();
    undoStack=[];$("difficulty").value=game.difficulty||"medium";$("notesBtn").setAttribute("aria-pressed",String(noteMode));return true;
  }catch(e){return false;}
}
function startTimer(){
  clearInterval(timerId);timerId=setInterval(()=>{if(game&&!game.finished){$("timer").textContent=fmt(elapsed());if(elapsed()%5===0)save();}},1000);
}
function setMessage(s){$("message").textContent=s;}
function conflicts(idx,n){
  const r=Math.floor(idx/9),c=idx%9,out=new Set();
  for(let i=0;i<9;i++){if(i!==c&&game.board[r][i]===n)out.add(r*9+i);if(i!==r&&game.board[i][c]===n)out.add(i*9+c);}
  const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
  for(let y=br;y<br+3;y++)for(let x=bc;x<bc+3;x++){const j=y*9+x;if(j!==idx&&game.board[y][x]===n)out.add(j);}
  return out;
}
function render(){
  const board=$("board");board.innerHTML="";
  const rSel=Math.floor(selected/9),cSel=selected%9,val=game.board[rSel][cSel];
  const conflictSet=new Set();for(let i=0;i<81;i++)if(game.board[Math.floor(i/9)][i%9])for(const j of conflicts(i,game.board[Math.floor(i/9)][i%9]))conflictSet.add(j);
  for(let i=0;i<81;i++){
    const r=Math.floor(i/9),c=i%9,v=game.board[r][c],cell=document.createElement("button");
    cell.className="cell";cell.type="button";cell.setAttribute("role","gridcell");cell.setAttribute("aria-label",`行${r+1} 列${c+1}${v||"空欄"}`);
    if(game.initial[r][c])cell.classList.add("given");
    if(r===rSel||c===cSel||(Math.floor(r/3)===Math.floor(rSel/3)&&Math.floor(c/3)===Math.floor(cSel/3)))cell.classList.add("related");
    if(v&&v===val)cell.classList.add("same-number");
    if(i===selected)cell.classList.add("selected");
    if(conflictSet.has(i)&&!game.initial[r][c])cell.classList.add("conflict");
    if(v){cell.append(document.createTextNode(v));}
    else if(game.notes[i]?.length){const note=document.createElement("span");note.className="notes";for(let n=1;n<=9;n++){const s=document.createElement("span");s.textContent=game.notes[i].includes(n)?n:"";note.append(s);}cell.append(note);}
    cell.disabled=game.finished;cell.addEventListener("click",()=>{selected=i;render();save();});board.append(cell);
  }
  const digits=$("digits");digits.innerHTML="";
  for(let n=1;n<=9;n++){const b=document.createElement("button");b.className="digit";b.textContent=n;b.type="button";
    const count=game.board.flat().filter(x=>x===n).length;b.disabled=game.finished||count===9;
    b.addEventListener("click",()=>enterNumber(n));digits.append(b);}
  $("timer").textContent=fmt(elapsed());$("mistakes").textContent=game.mistakes;
  $("progress").textContent=`入力済み ${game.board.flat().filter(Boolean).length} / 81`;
  $("bestLabel").textContent=DIFF_NAMES[game.difficulty];$("best").textContent=getBest(game.difficulty);
  $("notesBtn").setAttribute("aria-pressed",String(noteMode));
  $("undoBtn").disabled=undoStack.length===0||game.finished;
}
function enterNumber(n){
  if(game.finished)return;
  const r=Math.floor(selected/9),c=selected%9;
  if(game.initial[r][c]){showToast("最初からある数字は変更できません");return;}
  pushUndo();
  if(noteMode){
    if(game.board[r][c]){showToast("数字が入っているマスにはメモできません");undoStack.pop();return;}
    const notes=game.notes[selected]||[];game.notes[selected]=notes.includes(n)?notes.filter(x=>x!==n):[...notes,n].sort();setMessage("候補数字を更新");
  }else{
    game.notes[selected]=[];
    game.board[r][c]=n;
    if(n!==game.solution[r][c]){game.mistakes++;setMessage("正解と違う数字です");}
    else setMessage("いい調子！");
    if(game.board[r][c]===game.solution[r][c])for(let i=0;i<81;i++)game.notes[i]=(game.notes[i]||[]).filter(x=>x!==n);
    if(game.board.every((row,y)=>row.every((v,x)=>v===game.solution[y][x]))){finishGame();}
  }
  render();save();
}
function erase(){if(game.finished)return;const r=Math.floor(selected/9),c=selected%9;if(game.initial[r][c]){showToast("最初からある数字は消せません");return;}pushUndo();game.board[r][c]=0;game.notes[selected]=[];render();save();setMessage("マスを消去しました");}
function undo(){
  if(!undoStack.length||game.finished)return;
  try{const d=JSON.parse(undoStack.pop());game.board=d.board;game.notes=d.notes;game.mistakes=d.mistakes;elapsedBefore=d.elapsed;startedAt=Date.now();selected=d.selected;noteMode=d.noteMode;$("notesBtn").setAttribute("aria-pressed",String(noteMode));render();save();setMessage("1手戻しました");}catch(e){}
}
function hint(){
  if(game.finished)return;
  const empties=[];for(let i=0;i<81;i++){const r=Math.floor(i/9),c=i%9;if(!game.initial[r][c]&&game.board[r][c]!==game.solution[r][c])empties.push(i);}
  if(!empties.length){showToast("ヒントが必要なマスはありません");return;}
  const idx=empties.includes(selected)?selected:empties[Math.floor(Math.random()*empties.length)];
  pushUndo();selected=idx;const r=Math.floor(idx/9),c=idx%9;game.board[r][c]=game.solution[r][c];game.notes[idx]=[];
  game.notes[idx]=[];setMessage("ヒントを使いました");if(game.board.every((row,y)=>row.every((v,x)=>v===game.solution[y][x])))finishGame();render();save();
}
function finishGame(){
  elapsedBefore=elapsed();game.finished=true;clearInterval(timerId);
  const records=getRecords();records.push({difficulty:game.difficulty,time:elapsedBefore,date:new Date().toISOString(),mistakes:game.mistakes});records.sort((a,b)=>a.time-b.time);try{localStorage.setItem(RECORDS,JSON.stringify(records.slice(0,100)));}catch(e){}
  save();render();setMessage("クリア！おめでとうございます");showToast(`クリア！ タイム ${fmt(elapsedBefore)}`);
}
function getRecords(){try{return JSON.parse(localStorage.getItem(RECORDS)||"[]");}catch(e){return [];}}
function getBest(d){const rs=getRecords().filter(x=>x.difficulty===d);return rs.length?fmt(Math.min(...rs.map(x=>x.time))):"--:--";}
function showToast(text){const el=$("toast");el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2200);}
function showRecords(){
  const rs=getRecords(),content=$("recordsContent");content.innerHTML="";
  for(const d of ["easy","medium","hard"]){const best=rs.filter(x=>x.difficulty===d).sort((a,b)=>a.time-b.time)[0];const row=document.createElement("div");row.className="record-row";const label=document.createElement("span");label.textContent=DIFF_NAMES[d];const value=document.createElement("strong");value.textContent=best?fmt(best.time):"--:--";row.append(label,value);content.append(row);}
  const total=document.createElement("p");total.className="empty-record";total.textContent=`クリア回数：${rs.length} 回`;content.append(total);
  if(rs.length){const latest=[...rs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);for(const r of latest){const row=document.createElement("div");row.className="record-row";const date=document.createElement("span");date.textContent=`${DIFF_NAMES[r.difficulty]} · ${new Date(r.date).toLocaleDateString("ja-JP")}`;const time=document.createElement("strong");time.textContent=fmt(r.time);row.append(date,time);content.append(row);}}
  $("recordsDialog").showModal();
}
$("newGame").addEventListener("click",()=>{if(game&&!game.finished)$("confirmDialog").showModal();else freshGame($("difficulty").value);});
$("confirmNew").addEventListener("click",()=>{$("confirmDialog").close();freshGame($("difficulty").value);});
$("cancelNew").addEventListener("click",()=>$("confirmDialog").close());
$("difficulty").addEventListener("change",()=>{if(game&&!game.finished){$("confirmDialog").showModal();}else freshGame($("difficulty").value);});
$("notesBtn").addEventListener("click",()=>{noteMode=!noteMode;$("notesBtn").setAttribute("aria-pressed",String(noteMode));setMessage(noteMode?"候補数字メモ：数字を選択":"通常入力モード");save();});
$("undoBtn").addEventListener("click",undo);$("eraseBtn").addEventListener("click",erase);$("hintBtn").addEventListener("click",hint);
$("recordsBtn").addEventListener("click",showRecords);$("closeRecords").addEventListener("click",()=>$("recordsDialog").close());
$("clearRecords").addEventListener("click",()=>{if(confirm("クリア記録をすべて削除しますか？")){localStorage.removeItem(RECORDS);showRecords();render();}});
$("themeBtn").addEventListener("click",()=>{document.documentElement.classList.toggle("light");localStorage.setItem(THEME,document.documentElement.classList.contains("light")?"light":"dark");});
document.addEventListener("keydown",e=>{if(e.key>="1"&&e.key<="9")enterNumber(Number(e.key));else if(e.key==="Backspace"||e.key==="Delete")erase();else if(e.key==="ArrowUp"&&selected>=9){selected-=9;render();}else if(e.key==="ArrowDown"&&selected<72){selected+=9;render();}else if(e.key==="ArrowLeft"&&selected%9){selected--;render();}else if(e.key==="ArrowRight"&&selected%9<8){selected++;render();}});
window.addEventListener("pagehide",save);
if(localStorage.getItem(THEME)==="light")document.documentElement.classList.add("light");
if(load()){render();startTimer();setMessage(game.finished?"クリア済みの問題です":"保存した続きから再開");}
else freshGame($("difficulty").value);
if("serviceWorker" in navigator && location.protocol!=="file:"){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
})();