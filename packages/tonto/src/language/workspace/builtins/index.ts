import { BuiltInLib } from "../../../cli/model/BuiltInLib.js";
import { basicDataTypes } from "./basicDataTypes.js";

const builtInLibs: BuiltInLib[] = [
    {
        uri: "builtin:///basicDataTypes.tonto",
        content: basicDataTypes,
    },
];

export { builtInLibs, basicDataTypes };
