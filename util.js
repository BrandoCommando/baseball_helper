const CryptoJS = require("crypto-js");

class Util {}

Util.uuid = () => [4, 2, 2, 2, 6].map((group)=>CryptoJS.lib.WordArray.random(group).toString(CryptoJS.enc.Hex)).join('-');
Util.prettify = (o, prefix) => {
  if(typeof(o)=="string"&&["[","{"].indexOf(o[0])>-1)
  {
    const j = JSON.parse(o);
    if(j) o = j;
  }
  if(typeof(o)!="object") return JSON.stringify(o);
  if(!prefix) prefix = " ";
  const ret = [];
  if(Array.isArray(o))
  {
    let complex = o.find((c)=>typeof(c)=="object");
    if(!complex) return JSON.stringify(o);
    for(var i = 0; i<o.length; i++)
      ret.push(`${prefix}${Util.prettify(o[i],prefix+" ")}`)
    return `[\n${prefix} ${ret.join(",\n")}\n${prefix}]`;
  } else {
    let complex = false;
    for(var k in o)
    {
      if(typeof(o[k])=="object") complex = true;
      ret.push(`${prefix} "${k}": ${Util.prettify(o[k],prefix+" ")}`)
    }
    if(!complex) return JSON.stringify(o);
    return `{\n${prefix}${ret.join(",\n")}\n${prefix}}`;
  }
};
Util.addIP = (ip1, ip2) =>
{
  let outs = Math.round((ip1 % 1) * 10);
  outs += Math.round((ip2 % 1) * 10);
  let fulls = Math.floor(ip1);
  fulls += Math.floor(ip2);
  if(outs >= 3)
  {
    fulls++;
    outs -= 3;
  }
  return fulls + (outs * 0.1);
};
Util.tablify = (o,level) => {
  if(typeof(o)=="string"&&["[","{"].indexOf(o[0])>-1)
  {
    const j = JSON.parse(o);
    if(j) o = j;
  }
  if(typeof(o)!="object") return JSON.stringify(o);
  if(!o) return o;
  if(!level) level = 0;
  const ret = [];
  ret.push(`<table class="${!level?"tablify":""}">`)
  if(Array.isArray(o))
  {
    if(!o.length) return "[]";
    if(!o.find((c)=>typeof(c)=="object")) return JSON.stringify(o);
    ret.unshift(`<span class="bracket">[</span>`);
    for(var i = 0; i<o.length; i++)
      ret.push(`<tr><td class="item">${Util.tablify(o[i],level+1)}${i<o.length-1?",":""}</td></tr>`)
    ret.push('</table>');
    ret.push(`<span class="sum hide">...</span>`);
    ret.push(`<span class="bracket">]</span>`);
  } else {
    ret.unshift(`<span class="bracket">{</span>`);
    let complex = false;
    const keys = Object.keys(o);
    for(var i=0;i<keys.length;i++)
    {
      const k = keys[i];
      const comma = i < keys.length - 1 ? "," : "";
      if(typeof(o[k])=="object") {
        complex = true;
        // const ccount = Object.values(o[k]).length;
        const cret = Util.tablify(o[k],level+1);
        ret.push(`<tr><td class="key ${level>2?"closed":"open"}">"${k}":</td>
            <td data-level="${level}" class="value ${level>2?"hide":""}">${cret}${comma}</td>
            <td class="sum ${level>2?"":" hide"}">${Array.isArray(o[k])?"[...]":"{...}"}${comma}</td>
            </tr>`);
      } else ret.push(`<tr><td>"${k}":</td><td>${JSON.stringify(o[k])}${comma}</td></tr>`);
    }
    if(!complex) {
      const test = JSON.stringify(o);
      if(test.length<50) return test;
    }
    ret.push('</table>');
    ret.push(`<span class="sum hide">...</span>`);
    ret.push(`<span class="bracket">}</span>`);
  };
  return ret.join("\n");
}

module.exports = Util;
