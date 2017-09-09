import * as vscode from 'vscode';



export function alignment(): void{
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
      return;
  }
  const selections = editor.selections;
  let selection = selections[0];
  let range = new vscode.Range(selection.start.line, 0, selection.end.character > 0 ? selection.end.line : selection.end.line - 1, 1024);
  let text = editor.document.getText(range);
  let recontruct = test_new(text);
  
  editor.edit((editBuilder) => {
    editBuilder.replace(range, recontruct);
  });
}

const declaration_regformat = [
  /\/\/.*/, //line comment
  /((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *)/, //data_type
  /((<=.*)|(=.*);)|;/,  //assignment
  /(\[[^:]*:[^:]*\])+/, //vector
  /(\[[^:]*:[^:]*\])+/, //array
  /.*/, // variable (/wo assignment)
];
const dec_or_assign = /(((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *))|((<=.*)|(=.*))/;

const moduleio_regformat = /module .*\(/;

const io_regformat = [
  /\/\/.*/, //line comment
  /(input|output) *(reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime)*( *(signed)*)*/, //data_type
  /(\[[^:]*:[^:]*\])+/, //vector
  /.*/, // variable (/wo assignment)
];


function test_new(data:string): string{
  if(check_type(data, moduleio_regformat)){
    return io_proc(data);
  }
  else{
    return declration_and_assignment_proc(data);
  }
}

function declration_and_assignment_proc(data: string): string{
  let v1 = split_statements(data, '\n');
  let ident = get_ident(v1, dec_or_assign);
  let v2 = decs_handle(v1); // split a statement into fields and do inner-field prealignment
  let v3 = dec_format(v2, ident); // format the statements
  return v3;
}

function io_proc(data: string): string{
  let statement_obj : StatementString = {str : data};
  let mod = get_state_field(statement_obj, /module .*\(/);
  let modend = get_state_field(statement_obj, /\);/);
  let ss = statement_obj.str.replace(/,.*(\/\/.*)/g, '$1');
  let ios = ss.split('\n');
  ios = ios.map(io => io.replace(/,/g, '').trim());
  if(vscode.workspace.getConfiguration("systemverilog")['condenseBlankLines']){
    ios = cleanArray(ios);
  }
  else{
    while(ios[0] == '')
      ios.shift();

    while(ios[ios.length-1] == '')
      ios.pop();
  }

  let v2 = ios_handle(ios);
  let v3 = ios_format(v2, ' '.repeat(2));
  v3 = mod + '\n' + v3 + '\n' + modend;
  return v3;
}

const ios_handle = function (ios: string[]): string[][]{
  let ios_r = ios.map(io_split);
  ios_r = dec_align_vec(ios_r, 2); // align vector
  return ios_r.map(io => {
    if(io[0]=='1'){
      io[3] = io[3].replace(',', '');
      io[4] = ','+io[4];
    }
    return io;    
  });
}

const io_split = function(io_i: string): string[] {
  if(io_i == '')
    return ['0', io_i];
  else if(check_type(io_i, io_regformat[1])) {// split into list of io field
    let io = io_into_fields(io_i, io_regformat);
    // io_reg [flag, comment, data_type, assignment, vector, array, variable] 
    let io_arrange = [io[0], io[2], io[3], io[4], io[1]];
    return io_arrange;
  }
  else if(!check_type(io_i, io_regformat[0]))
    return ['1', '', '', io_i.trim(), ''];
  else // unchange and marked as don't touch
    return ['0', io_i];
};

function io_into_fields(statement: string, fields: RegExp[]): string[]{
  let format_list = ['1'];
  let statement_obj : StatementString = {str : statement};
  format_list.push(get_state_field_donttouch(statement_obj, fields[0])); //comment
  format_list.push(get_state_field(statement_obj, fields[1])); // assignment
  format_list.push(get_state_field(statement_obj, fields[2])); // dtype
  format_list.push(get_state_field(statement_obj, fields[3])); // vector
  format_list.push(get_state_field(statement_obj, fields[4])); // array
  return format_list;
}

const ios_format = function(declarations_infield: string[][], ident: string): string{
  declarations_infield[declarations_infield.length-1][4] = declarations_infield[declarations_infield.length-1][4].replace(',', '');
  if(!vscode.workspace.getConfiguration("systemverilog")['alignEndOfLine']){
    for(let dec of declarations_infield){
      if(dec.length > 4){
        if(dec[4][0] == ',')
          dec[3] = dec[3]+',';
        dec[4] = dec[4].replace(',', '');
      }
    }
  }
  let anchors = get_anchors(declarations_infield, io_regformat.length);
  let recontructs = declarations_infield.map(dec => format(dec, anchors, ident));
  return recontructs.join('\n');
}

const dec_format = function(declarations_infield: string[][], ident: string): string{
  let anchors = get_anchors(declarations_infield, declaration_regformat.length);
  let recontructs = declarations_infield.map(dec => format(dec, anchors, ident));
  return recontructs.join('\n');
}

const decs_handle = function (declarations: string[]): string[][]{
  let decs_r = declarations.map(dec_split);
  
  // dec     [mask, dtype, vec, variable, array, assignment]
  decs_r = dec_align_vec(decs_r, 2); // align vector
  decs_r = dec_align_vec(decs_r, 4); // align array
  decs_r = dec_align_assignment(decs_r, 5); // align assignment

  return decs_r;
}

const dec_split = function(declaration: string): string[] {
  if(check_type(declaration, dec_or_assign)) {// split into list of declaration field
    let dec = split_into_fields(declaration, declaration_regformat);
    // dec_reg [flag, comment, data_type, assignment, vector, array, variable] 
    let dec_arrange = [dec[0], dec[2], dec[4], dec[6], dec[5], dec[3], dec[1]];
    return dec_arrange;
  }
  else // unchange and marked as don't touch
    return ['0', declaration];
};

function dec_align_assignment(declarations: string[][], assign_idx: number): string[][]{
  let rval_max = 0;
  for(let dec of declarations){
    if(dec[0] == '1'){
      if(dec[assign_idx].search(/(=)/) !== -1){ // is assignment
        dec[assign_idx] = dec[assign_idx].replace(/([\+\-\*]{1,2}|\/)/g,  ' $1 ');
        dec[assign_idx] = dec[assign_idx].replace(/(,)/g,  '$1 ');
        if(dec[assign_idx].search(/<=/) !== -1){
          dec[assign_idx] = dec[assign_idx].slice(2, dec[assign_idx].length-1).trim();
          rval_max = dec[assign_idx].length > rval_max ? dec[assign_idx].length : rval_max;
          dec[assign_idx] = '<= '+ dec[assign_idx];
        }
        else {
          dec[assign_idx] = dec[assign_idx].slice(1, dec[assign_idx].length-1).trim();
          rval_max = dec[assign_idx].length > rval_max ? dec[assign_idx].length : rval_max;
          dec[assign_idx] = '= '+ dec[assign_idx];
        }
      }
      else {
        dec[assign_idx] = '';
      }
    }
  }
  rval_max += 2;
  for(let dec of declarations){
    if(dec[0] == '1'){
      if(dec[assign_idx].search(/<=/) !== -1)
        dec[assign_idx] = PadRight(dec[assign_idx], rval_max+1) + ';';
      else
        dec[assign_idx] = PadRight(dec[assign_idx], rval_max) + ';';
    }
  }
  return declarations;
}

/**
 * Align the indicies of vectors
 * 
 * @param {any[]} declarations 
 * @param {number} vec_field_idx 
 * @returns {any[]} 
 */
function dec_align_vec(declarations: string[][], vec_field_idx: number): string[][]{
  let idxs = declarations.map(dec => get_vec_idxs(dec, vec_field_idx));
  let rval_max = idxs.filter(a => a.length > 0)
    .reduce(reduce_max_array, []);
  let vec_strs = idxs.map(idx => gen_vec_string(idx, rval_max));

  idxs.forEach((idx,i) => declarations[i][vec_field_idx] = vec_strs[i]);
  
  return declarations;
}

function get_ident(declarations: string[], type: RegExp): string{
  let first = declarations.find(dec => check_type(dec, type));
  if(first)
    return first.match(/\s*/)[0]; // get ident from first statement
  else
    return '';
}

function format(statement_infield: string[], anchors: number[], ident: string): string{
  if(statement_infield[0]=='1'){
    return statement_infield.slice(1)
      .map((s,i) => `${PadRight(s, anchors[i+1])}`)
      .reduce((acc,str) => acc+str, ident);
  }
  else{
    return statement_infield[1];
  }
}
function split_statements(text: string, split_point: string): string[]{
  return text.split("\n");
}
function check_type(statement:string, type_identifier:RegExp): boolean{
  if(statement.search(type_identifier) !== -1)
    return true;
  else
    return false;
}
function split_into_fields(statement: string, fields: RegExp[]): string[] {
  let format_list = ['1'];
  let statement_obj : StatementString = {str : statement};
  format_list.push(get_state_field_donttouch(statement_obj, fields[0])); //comment
  format_list.push(get_state_field(statement_obj, fields[1])); // assignment
  format_list.push(get_state_field(statement_obj, fields[2])); // dtype
  if(format_list[2]  == 'assign' || format_list[2] == ""){ //pure assignment
    format_list.push(""); //no vector
    format_list.push(""); //no array
  }
  else{
    format_list.push(get_state_field(statement_obj, fields[3])); // vector
    format_list.push(get_state_field(statement_obj, fields[4])); // array
  }
  format_list.push(get_state_field(statement_obj, fields[5]).replace(/(,)/g,  '$1 ')); // l_value or variable
  return format_list;
}
function get_anchors(statements_infield: string[][], num_of_anchors: number): number[]{
  return statements_infield.filter(s => s[0] != '0')
    .reduce(reduce_max_array, [])
    .map(a_cnt => a_cnt > 0 ? a_cnt + 1: a_cnt);
}
function get_state_field(s_obj: StatementString, regx: RegExp): string{
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0].trim().replace(/\s{2,}/g, ' ');
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}
function get_state_field_donttouch(s_obj: StatementString, regx: RegExp): string{
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0];
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}
function get_max(a, b){
  return a > b ? a : b;
}
function cleanArray<T>(actual: T[]): T[] {
  return actual.filter(act => act);
}
function PadLeft(str:string, width: number): string {
  return ' '.repeat(width - str.length) + str;
}
function PadRight(str:string, width: number): string {
  return str + ' '.repeat(width - str.length);
}
function reduce_max_array(acc: number[], val: string[]): number[]{
  let res = acc.slice(0);
  for (let i = 0; i < res.length && i < val.length; i++) {
    if(val[i].length > acc[i])
      res[i] = val[i].length;
  }
  return res.concat(val.slice(res.length).map(s => s.length));
}
function get_vec_idxs(dec: string[], vec_field_idx: number): string[] {
  if(dec[0] == '1' && dec[vec_field_idx].search(/\[/) !== -1){ // has vector
    let vec_ary: string[] = dec[vec_field_idx].split(/[\[\]:]/).slice(0,-1);
    return cleanArray(vec_ary);
  }
  else{
    return [];
  }
}
function gen_vec_string(idxs: string[], widths: number[]){
  let restruc = '';
  return idxs
    .map((idx,i) => i%2 == 0 ? `[${PadLeft(idx, widths[i])}:` : `${PadLeft(idx, widths[i])}]`)
    .join('');
}

interface StatementString {
  str: string;
}
