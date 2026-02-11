import { LLMConfig } from "@/types/llm_config";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface UserConfigState {
  can_change_keys: boolean
  enable_custom_templates: boolean
  llm_config: LLMConfig
}

const initialState: UserConfigState = {
  llm_config: {},
  can_change_keys: false,
  enable_custom_templates: false,
}

const userConfigSlice = createSlice({
  name: "userConfig",
  initialState: initialState,
  reducers: {
    setLLMConfig: (state, action: PayloadAction<LLMConfig>) => {
      state.llm_config = action.payload;
    },
    setCanChangeKeys: (state, action: PayloadAction<boolean>) => {
      state.can_change_keys = action.payload;
    },
    setEnableCustomTemplates: (state, action: PayloadAction<boolean>) => {
      state.enable_custom_templates = action.payload;
    }
  },
});

export const { setLLMConfig, setCanChangeKeys, setEnableCustomTemplates } = userConfigSlice.actions;
export default userConfigSlice.reducer;