/**
 * SeaTable API Types
 */
/**
 * Column Types in SeaTable
 */
export var ColumnType;
(function (ColumnType) {
    ColumnType["Text"] = "text";
    ColumnType["Number"] = "number";
    ColumnType["Checkbox"] = "checkbox";
    ColumnType["Date"] = "date";
    ColumnType["SingleSelect"] = "single-select";
    ColumnType["MultipleSelect"] = "multiple-select";
    ColumnType["Image"] = "image";
    ColumnType["File"] = "file";
    ColumnType["Email"] = "email";
    ColumnType["URL"] = "url";
    ColumnType["Duration"] = "duration";
    ColumnType["Rating"] = "rating";
    ColumnType["Formula"] = "formula";
    ColumnType["Link"] = "link";
    ColumnType["Creator"] = "creator";
    ColumnType["CreatedTime"] = "ctime";
    ColumnType["LastModifier"] = "last-modifier";
    ColumnType["ModifiedTime"] = "mtime";
})(ColumnType || (ColumnType = {}));
