package domain

import (
	"bytes"
	_ "embed"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

//go:embed catalog.json
var catalogBytes []byte

var catalog struct {
	Recipes       json.RawMessage `json:"recipes"`
	IngredientIDs []string        `json:"ingredientIds"`
	ToolIDs       []string        `json:"toolIds"`
	Fresh         json.RawMessage `json:"fresh"`
}
var ingredientIDs, toolIDs, recipeIDs map[string]bool
var customID = regexp.MustCompile(`^custom-[a-f0-9-]{36}$`)
var stepReference = regexp.MustCompile(`\{(\w+)\}`)

func init() {
	if err := json.Unmarshal(catalogBytes, &catalog); err != nil {
		panic(err)
	}
	ingredientIDs, toolIDs, recipeIDs = set(catalog.IngredientIDs), set(catalog.ToolIDs), map[string]bool{}
	var recipes []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(catalog.Recipes, &recipes); err != nil {
		panic(err)
	}
	for _, recipe := range recipes {
		recipeIDs[recipe.ID] = true
	}
}

func Fresh() json.RawMessage   { return bytes.Clone(catalog.Fresh) }
func Recipes() json.RawMessage { return bytes.Clone(catalog.Recipes) }

type object = map[string]any
type validator struct{ err error }

func (v *validator) require(ok bool, message string) {
	if !ok && v.err == nil {
		v.err = errors.New(message)
	}
}
func obj(value any) object     { result, _ := value.(map[string]any); return result }
func text(value any) string    { result, _ := value.(string); return result }
func number(value any) float64 { result, _ := value.(float64); return result }
func set(values []string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}
func member(value any, values ...string) bool {
	for _, item := range values {
		if value == item {
			return true
		}
	}
	return false
}
func (v *validator) record(value any) object {
	result := obj(value)
	v.require(result != nil, "对象格式无效")
	return result
}
func (v *validator) list(value any, limit int) []any {
	result, ok := value.([]any)
	v.require(ok && len(result) <= limit, "列表格式无效或超过上限")
	if !ok || len(result) > limit {
		return nil
	}
	return result
}
func (v *validator) string(value any, limit int, nonempty bool) string {
	result, ok := value.(string)
	v.require(ok && len(utf16.Encode([]rune(result))) <= limit && (!nonempty || strings.TrimSpace(result) != ""), "文字字段无效")
	return result
}
func (v *validator) numeric(value any, min, max float64) float64 {
	result, ok := value.(float64)
	v.require(ok && !math.IsNaN(result) && !math.IsInf(result, 0) && result >= min && result <= max, "数量或范围无效")
	return result
}
func (v *validator) boolean(value any) { _, ok := value.(bool); v.require(ok, "布尔字段无效") }
func (v *validator) date(value any) {
	s := v.string(value, 2000, true)
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02", "2006-01-02T15:04:05", time.RFC1123} {
		if _, err := time.Parse(layout, s); err == nil {
			return
		}
	}
	v.require(false, "日期无效")
}
func (v *validator) unique(rows []any, key string) {
	seen := map[string]bool{}
	for _, row := range rows {
		id := text(obj(row)[key])
		v.require(!seen[id], "编号重复")
		seen[id] = true
	}
}
func (v *validator) known(value any, known map[string]bool) {
	v.require(known[text(value)], "目录编号无效")
}
func defaults(data object, key string, fallback any) any {
	if data[key] == nil {
		return fallback
	}
	return data[key]
}

// Normalize validates the complete persisted workspace and upgrades v1 without
// discarding recipes, images or frozen snapshots from supported v2 records.
func Normalize(input []byte) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(input, &value); err != nil {
		return nil, fmt.Errorf("JSON 无效: %w", err)
	}
	v := &validator{}
	data := v.record(value)
	version := number(data["schemaVersion"])
	v.require(version == 1 || version == 2, "不支持的备份版本")
	if version == 1 {
		_, a := data["customRecipes"]
		_, b := data["collections"]
		v.require(!a && !b, "不能降级丢失私人配方或合集")
	}
	customs, collections := []any{}, []any{}
	if version == 2 {
		customs = v.list(data["customRecipes"], 200)
		collections = v.list(data["collections"], 100)
	}
	for _, item := range customs {
		v.custom(v.record(item))
	}
	v.unique(customs, "id")
	favorites := v.list(data["favorites"], 1000)
	uniqueFavorites, seen := []any{}, map[string]bool{}
	for _, id := range favorites {
		v.known(id, recipeIDs)
		if !seen[text(id)] {
			uniqueFavorites = append(uniqueFavorites, id)
			seen[text(id)] = true
		}
	}
	stock := v.record(data["stock"])
	for id, state := range stock {
		v.require(ingredientIDs[id] && member(state, "unknown", "have", "low", "none"), "材料状态无效")
	}
	equipment := v.record(defaults(data, "equipment", object{}))
	for id, state := range equipment {
		v.require(toolIDs[id] && member(state, "unknown", "have", "none"), "器具状态无效")
	}
	versions := v.list(data["versions"], 1000)
	plan := v.list(defaults(data, "plan", []any{}), 30)
	for _, rows := range [][]any{versions, plan} {
		for _, item := range rows {
			v.version(v.record(item))
		}
		v.unique(rows, "id")
	}
	for _, item := range collections {
		v.collection(v.record(item))
	}
	v.unique(collections, "id")
	coffee := v.list(defaults(data, "coffeeRecords", []any{}), 100)
	for _, item := range coffee {
		v.coffee(v.record(item))
	}
	v.unique(coffee, "id")
	theme := data["theme"]
	if !member(theme, "oat", "coffee", "slate", "sage", "clay") {
		theme = "oat"
	}
	if v.err != nil {
		return nil, v.err
	}
	return json.Marshal(object{"schemaVersion": 2, "customRecipes": customs, "collections": collections, "favorites": uniqueFavorites, "stock": stock, "equipment": equipment, "versions": versions, "plan": plan, "coffeeRecords": coffee, "theme": theme})
}

func (v *validator) custom(c object) {
	v.require(customID.MatchString(text(c["id"])) && member(c["status"], "draft", "ready"), "自建配方编号或状态无效")
	v.numeric(c["baseServings"], .5, 20)
	v.date(c["updatedAt"])
	recipe := v.record(c["recipe"])
	v.require(text(recipe["id"]) == text(c["id"]), "自建配方编号不一致")
	v.recipe(recipe, c["status"] == "draft", true)
	if c["status"] == "ready" {
		v.string(recipe["name"], 100, true)
		for _, value := range v.list(recipe["ingredients"], 100) {
			v.require(number(obj(value)["amount"])/number(c["baseServings"]) <= 100000, "每份材料用量超过上限")
		}
	}
}

func (v *validator) collection(c object) {
	v.string(c["id"], 100, false)
	v.string(c["name"], 100, true)
	v.string(c["description"], 2000, false)
	v.date(c["updatedAt"])
	items := v.list(c["items"], 50)
	seen := map[string]bool{}
	for _, value := range items {
		item := v.record(value)
		v.string(item["id"], math.MaxInt32, false)
		v.string(item["sourceId"], math.MaxInt32, false)
		v.require(member(item["source"], "reference", "version", "custom"), "合集来源无效")
		snapshot := v.record(item["snapshot"])
		v.version(snapshot)
		key, _ := json.Marshal([]any{item["source"], item["sourceId"], snapshot["updatedAt"]})
		v.require(!seen[string(key)], "合集版本重复")
		seen[string(key)] = true
	}
	v.unique(items, "id")
}

func (v *validator) version(data object) {
	v.string(data["id"], math.MaxInt32, false)
	id := text(data["recipeId"])
	v.require(recipeIDs[id] || customID.MatchString(id), "做法配方编号无效")
	v.string(data["name"], 100, true)
	v.string(data["note"], 10000, false)
	v.date(data["updatedAt"])
	v.numeric(data["servings"], .5, 20)
	amounts := v.record(data["amounts"])
	for id, amount := range amounts {
		v.require(ingredientIDs[id], "用量编号无效")
		v.numeric(amount, 0, 100000)
	}
	recipe := v.record(data["snapshot"])
	v.require(text(recipe["id"]) == text(data["recipeId"]), "快照编号不一致")
	v.recipe(recipe, false, false)
	for _, item := range v.list(recipe["ingredients"], 100) {
		_, ok := amounts[text(obj(item)["id"])]
		v.require(ok, "快照缺少原料用量")
	}
}

func (v *validator) recipe(r object, draft, custom bool) {
	limit := math.MaxInt32
	if custom {
		limit = 100
	}
	v.string(r["name"], limit, false)
	v.string(r["en"], math.MaxInt32, false)
	descriptionLimit, sourceLimit, methodLimit := math.MaxInt32, math.MaxInt32, math.MaxInt32
	if custom {
		descriptionLimit, sourceLimit, methodLimit = 10000, 2000, 200
	}
	v.string(r["description"], descriptionLimit, false)
	v.string(r["story"], descriptionLimit, false)
	v.string(r["source"], sourceLimit, false)
	v.string(r["method"], methodLimit, false)
	v.require(member(r["category"], "coffee", "tea", "fruit", "cocktail"), "配方分类无效")
	v.numeric(r["minutes"], 0, 10000)
	image := v.numeric(r["image"], 0, 23)
	v.require(image == math.Trunc(image), "目录图片编号无效")
	v.boolean(r["alcohol"])
	for _, tag := range v.list(r["tags"], math.MaxInt32) {
		v.string(tag, math.MaxInt32, false)
	}
	rowLimit := math.MaxInt32
	if custom {
		rowLimit = 100
	}
	rows := v.list(r["ingredients"], rowLimit)
	v.unique(rows, "id")
	ids := map[string]bool{}
	for _, value := range rows {
		item := v.record(value)
		v.known(item["id"], ingredientIDs)
		ids[text(item["id"])] = true
		v.numeric(item["amount"], 0, 100000)
		v.require(member(item["unit"], "ml", "g", "片"), "材料单位无效")
		if optional, exists := item["optional"]; exists {
			v.boolean(optional)
		}
	}
	steps := v.list(r["steps"], rowLimit)
	for _, step := range steps {
		s := v.string(step, 10000, custom && !draft)
		if !draft {
			v.references(s, ids)
		}
	}
	if !draft {
		v.require(len(rows) > 0 && len(steps) > 0, "配方材料和步骤尚未完成")
	}
	if tools, exists := r["toolRequirements"]; exists || custom {
		requirements := v.list(tools, 30)
		v.unique(requirements, "id")
		for _, value := range requirements {
			item := v.record(value)
			v.known(item["id"], toolIDs)
			if optional, exists := item["optional"]; exists {
				v.boolean(optional)
			}
			if note, exists := item["note"]; exists {
				v.string(note, 2000, false)
			}
			if alternatives, exists := item["alternatives"]; exists {
				for _, id := range v.list(alternatives, 100) {
					v.known(id, toolIDs)
				}
			}
		}
	}
	if ref, exists := r["reference"]; exists {
		reference := v.record(ref)
		v.require(reference["status"] == "reference", "验证状态无效")
		v.string(reference["version"], 100, false)
		v.string(reference["timeNote"], 2000, false)
		for id, spec := range v.record(reference["specs"]) {
			v.require(ingredientIDs[id], "规格材料无效")
			v.string(spec, 2000, false)
		}
	}
	if photo, exists := r["photo"]; exists {
		v.require(validPhoto(photo), "配方图片格式无效")
	}
	v.preparations(r, rows)
	v.resolutions(r, ids, steps)
}

func (v *validator) references(step string, ids map[string]bool) {
	for _, match := range stepReference.FindAllStringSubmatch(step, -1) {
		v.require(ids[match[1]], "步骤引用未知原料")
	}
}

func validPhoto(value any) bool {
	s, ok := value.(string)
	if !ok || len(s) > 87416 {
		return false
	}
	kind, encoded, ok := strings.Cut(s, ";base64,")
	if !ok || (kind != "data:image/webp" && kind != "data:image/jpeg") {
		return false
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(data) < 12 || len(data) > 64*1024 {
		return false
	}
	if kind == "data:image/jpeg" {
		return bytes.HasPrefix(data, []byte{255, 216}) && bytes.HasSuffix(data, []byte{255, 217})
	}
	return len(data) >= 16 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" && int(binary.LittleEndian.Uint32(data[4:8]))+8 == len(data) && member(string(data[12:16]), "VP8 ", "VP8L", "VP8X")
}

func (v *validator) coffee(r object) {
	v.require(member(r["method"], "espresso", "pour", "immersion", "cold", "instant"), "萃取方式无效")
	for _, key := range []string{"id", "bean", "equipment", "grind", "roast", "note", "updatedAt"} {
		v.string(r[key], 2000, key == "id")
	}
	v.date(r["updatedAt"])
	for _, field := range []struct {
		key      string
		min, max float64
	}{{"dose", .1, 200}, {"ratio", .5, 100}, {"temperature", 0, 100}, {"seconds", 0, 86400}, {"actualYield", 0, 20000}} {
		v.numeric(r[field.key], field.min, field.max)
	}
}

func (v *validator) preparations(r object, ingredients []any) {
	value, exists := r["preparations"]
	if !exists {
		return
	}
	rows := v.list(value, 2)
	v.unique(rows, "target")
	for _, value := range rows {
		p := v.record(value)
		v.require(member(p["id"], "syrup-1to1", "espresso-extract") && p["version"] == float64(1), "自制类型无效")
		target, input := "espresso", "groundcoffee"
		if p["id"] == "syrup-1to1" {
			target, input = "syrup", "sugar"
		}
		v.require(p["target"] == target, "自制目标无效")
		targetIngredient := object{}
		for _, row := range ingredients {
			if obj(row)["id"] == target {
				targetIngredient = obj(row)
			}
		}
		v.numeric(targetIngredient["amount"], .0001, 100000)
		inputs := v.preparationInputs(p["inputs"], input, 0)
		for _, tool := range v.list(p["tools"], 100) {
			v.known(tool, toolIDs)
		}
		v.string(p["label"], math.MaxInt32, false)
		v.string(p["note"], 2000, false)
		v.require(len(v.list(p["steps"], 0)) == 0, "自制步骤格式无效")
		if batch, exists := p["batch"]; exists {
			b := v.record(batch)
			yield := v.numeric(b["outputMl"], 1, 10000)
			batchInputs := v.preparationInputs(b["inputs"], input, .001)
			v.require(targetIngredient["unit"] == "ml", "自制产出单位无效")
			for id, amount := range inputs {
				expected := batchInputs[id] * number(targetIngredient["amount"]) / yield
				v.require(math.Abs(amount-expected) <= math.Max(1e-8, expected*1e-8), "自制投入与批次比例不一致")
			}
			if p["id"] == "syrup-1to1" {
				v.require(batchInputs["sugar"] == 100 && batchInputs["water"] == 100, "糖浆批次基准无效")
			}
			if coffee, exists := p["coffeeRecord"]; exists {
				c := v.record(coffee)
				v.coffee(c)
				v.require(p["id"] == "espresso-extract" && c["method"] == "espresso" && batchInputs["groundcoffee"] == number(c["dose"]), "萃取参数与自制批次不一致")
			}
		} else {
			_, exists := p["coffeeRecord"]
			v.require(!exists, "萃取记录缺少批次")
		}
	}
}

func (v *validator) preparationInputs(value any, ingredient string, min float64) map[string]float64 {
	rows := v.list(value, 2)
	v.require(len(rows) == 2, "自制投入需两个原料")
	v.unique(rows, "id")
	result := map[string]float64{}
	for _, value := range rows {
		row := v.record(value)
		v.require(member(row["id"], ingredient, "water") && row["unit"] == "g", "自制投入材料无效")
		result[text(row["id"])] = v.numeric(row["amount"], min, 100000)
	}
	v.require(len(result) == 2, "自制投入重复或缺失")
	return result
}

func (v *validator) resolutions(r object, ids map[string]bool, steps []any) {
	value, exists := r["resolutions"]
	if !exists {
		return
	}
	rows := v.list(value, 3)
	v.unique(rows, "target")
	targets := map[string]string{"syrup-home": "syrup", "espresso-home": "espresso", "milk-oat": "milk", "instant-base": "espresso"}
	for _, value := range rows {
		resolution := v.record(value)
		id := text(resolution["id"])
		target, ok := targets[id]
		kind := "approximation"
		if strings.HasSuffix(id, "-home") {
			kind = "preparation"
		}
		v.require(ok && resolution["target"] == target && resolution["kind"] == kind && resolution["version"] == float64(1), "替代方案对应关系无效")
		v.string(resolution["label"], 200, false)
		v.string(resolution["effect"], 2000, false)
		if id == "milk-oat" {
			v.require(r["id"] == "vanilla-latte", "燕麦替代不适用此配方")
		}
		if id == "instant-base" {
			v.require(member(r["id"], "oat-latte", "coconut-coffee"), "速溶替代不适用此配方")
		}
		if undo, exists := resolution["undo"]; exists {
			v.undo(v.record(undo), id, target, ids, steps)
		}
	}
}

func (v *validator) undo(u object, rule, target string, ids map[string]bool, steps []any) {
	original := v.record(u["original"])
	v.require(original["id"] == target && original["unit"] == "ml", "撤销原料无效")
	v.numeric(original["amount"], 0, 100000)
	v.numeric(u["amountBefore"], 0, 100000)
	index := v.numeric(u["indexBefore"], 0, 100)
	v.require(index == math.Trunc(index), "撤销位置无效")
	if optional, exists := original["optional"]; exists {
		v.boolean(optional)
	}
	expected := []string{}
	if rule == "milk-oat" {
		expected = []string{"oat"}
	}
	if rule == "instant-base" {
		expected = []string{"instantcoffee", "water"}
	}
	replacements := v.list(u["replacements"], 100)
	v.require(len(replacements) == len(expected), "撤销替代原料无效")
	for i, id := range replacements {
		if i < len(expected) {
			v.require(id == expected[i], "撤销替代原料顺序无效")
		}
	}
	for _, field := range []string{"nameBefore", "nameAfter"} {
		v.string(u[field], 200, false)
	}
	for _, field := range []string{"tagsBefore", "tagsAfter"} {
		for _, tag := range v.list(u[field], 10000) {
			v.string(tag, 200, false)
		}
	}
	if spec, exists := u["specBefore"]; exists {
		v.string(spec, 2000, false)
	}
	allowed := map[string]bool{target: true}
	for id := range ids {
		allowed[id] = true
	}
	for _, value := range v.list(u["edits"], 100) {
		edit := v.record(value)
		after := v.string(edit["after"], 10000, false)
		found := false
		for _, step := range steps {
			if step == after {
				found = true
			}
		}
		v.require(found, "撤销信息与步骤不一致")
		if edit["before"] != nil {
			v.references(v.string(edit["before"], 10000, false), allowed)
		}
	}
}
