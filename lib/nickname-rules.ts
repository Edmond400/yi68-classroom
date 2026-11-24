export function nicknameCharacters(value:string){
 if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(value)].map(s=>s.segment);
 // Older embedded browsers still group common emoji, flags and combining marks.
 const parts:string[]=[];for(const char of Array.from(value)){const last=parts[parts.length-1];if(last&&(/\p{M}|\p{Emoji_Modifier}/u.test(char)||char==='\u200d'||last.endsWith('\u200d')||/\p{Regional_Indicator}/u.test(char)&&/^\p{Regional_Indicator}$/u.test(last)))parts[parts.length-1]+=char;else parts.push(char)}return parts;
}
export function nicknameLength(value:string){return nicknameCharacters(value).length}
export function nicknameIssue(value:string){
 if(!value||value.length>512||nicknameLength(value)>12)return '昵称需要1—12个字或表情。';
 if(/\s/u.test(value)||/[\p{Cc}\p{Cs}\p{Co}\p{Cn}]/u.test(value)||/\p{Cf}/u.test(value.replace(/\u200d/g,'')))return '昵称不能包含空格、控制符或隐藏字符。';
 for(const segment of nicknameCharacters(value)){
  if(!/[\p{L}\p{N}\p{P}\p{S}]/u.test(segment)||segment.includes('\u200d')&&(!/\p{Extended_Pictographic}/u.test(segment)||segment.endsWith('\u200d')))return '请使用可见的文字、数字、符号或表情作为昵称。';
 }
 return '';
}
