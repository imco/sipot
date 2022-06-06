import csv
import glob
import pandas as pd
import sys


usage = """
Usage:
  join_excel_and_csv_files.py --input_dir=str --output_file=str --type=str

Example:
  python scripts/join_excel_and_csv_files.py --input_dir=/Users/me/Documents/sipot/data/federal/adjudicaciones/ --output_file=/Users/me/Downloads/sipot-federal-adjudicaciones2020-2021.csv --type=adjudicaciones


Input options (required):
  --input_dir=<str>    /path/to/directory/containing/raw_excel_and_csv_files/ 
  --output_file=<str>  /path/to/output_csv_filename_with_aggregated_results.csv
  --type=<str>         Must be adjudicaciones OR licitaciones

"""


def run_etl(input_dir, output_file, contract_type):
    contract_type = contract_type.lower()
    if contract_type not in {'adjudicaciones', 'licitaciones'}:
        print("Opción 'type' debe ser 'adjudicaciones' o 'licitaciones'.")
        return
    if contract_type == 'licitaciones':
        formato_val = 'Procedimientos de licitación pública e invitación a cuando menos tres personas'
        extra_step_lp = True  # Get table for 'Personas físicas o morales con proposición u oferta' in extra tab
    elif contract_type == 'adjudicaciones':
        formato_val = 'Procedimientos de adjudicación directa'
        extra_step_lp = False

    main_df = None
    extra_df = None

    excel_files = glob.glob(f'{input_dir}**/*.xls', recursive = True)
    excel_files.extend(glob.glob(f'{input_dir}**/*.xlsx', recursive = True))
    csv_files = glob.glob(f'{input_dir}**/*.csv', recursive=True)
    excel_files = [f for f in excel_files if contract_type in f]
    csv_files = [f for f in csv_files if contract_type in f]

    # In some cases, Excel files were not receieved via email, so CSV files
    # were requested instead. The format for these is different.
    csv_files_clean = []
    if csv_files:
        string_to_include = 'LGT_Art_70_Fr_XXVIII'
        for cf in csv_files:
            if string_to_include in cf.split('/')[-1]:
                csv_files_clean.append(cf)

    print((
        f'Se encontraron {len(excel_files)} archivos excel y '
        f'{len(csv_files_clean)} archivos csv de tipo {contract_type} '
        f'en el directorio {input_dir}'))

    for f in excel_files:
        try:
            df, df2  = process_df(f, 'excel', formato_val, extra_step_lp=extra_step_lp)
        except Exception as e:
            print("ERROR:", f)
            print(e)
            continue

        if df is None:
            continue
        elif main_df is None:
            main_df = df
        else:
            main_df = pd.concat([main_df, df], axis=0, ignore_index=True)
                
        if extra_df is None:
            extra_df = df2
        elif df2 is not None:
            extra_df = pd.concat([extra_df, df2], axis=0, ignore_index=True)

    for f in csv_files_clean:
        # CSVs were only used for the federal level, so we are going to
        # ignore the extra tab needed for licitaciones públicas at the
        # state level
        df, _ = process_df(f, 'csv', formato_val)
        if df is None:
            continue
        elif main_df is None:
            main_df = df
        else:
            main_df = pd.concat([main_df, df], axis=0, ignore_index=True)

    # Check for duplicates and remove
    num_rows_before = len(main_df)
    main_df.drop_duplicates(keep='first', inplace=True, ignore_index=True)
    print((
        f'Se creó el DataFrame con {len(main_df)} registros y '
        f'{main_df.shape[1]} columnas. Se borraron '
        f'{num_rows_before - len(main_df)} registros duplicados.'))

    main_df.to_csv(output_file, index=False, quoting=csv.QUOTE_ALL)
    print(f'Se guardaron los resultados en {output_file}')
    if extra_df is not None:
        extra_df.drop_duplicates(keep='first', inplace=True, ignore_index=True)
        extra_df.to_csv(output_file.split('.csv')[0]+'-APENDICE.csv',
                        index=False, quoting=csv.QUOTE_ALL)
        print(
            f"Se guardó el archivo apéndice en {output_file.split('.csv')[0]}-APENDICE.csv")


def process_df(file_name, file_type, contract_type_full, extra_step_lp=False):
    if file_type == 'excel':
        df = pd.read_excel(file_name, header=5)
    elif file_type == 'csv':
        df = pd.read_csv(file_name, encoding='latin-1', skiprows=3)
    else:
        print("ERROR: 'file_type' debe ser 'excel' o 'csv'.")
        return None, None

    # If file path contains 'estados', add the state name to new column
    state_name = None
    formato = None
    if '/estados/' in file_name:
        state_name = file_name.split('estados/')[1].split('/')[0]
        if state_name:
            df['ESTADO'] = state_name.upper()
        else:
            # Override "extra step" in the case of the federal level
            extra_step_lp=False
    
    # Add the 'Nombre del Sujeto Obligado' from the header
    if file_type == 'excel':
        df_meta = pd.read_excel(
            file_name, header=None, nrows=4, usecols=[0,1],
            names=['column', 'value'])
    elif file_type == 'csv':
        df_meta = pd.read_csv(
            file_name, header=None, nrows=4, usecols=[0,1], 
            names=['column', 'value'], encoding='latin-1')

    for d in df_meta.to_dict('records'):
        try:
            col = d['column'][:-1]
        except:
            print("ERROR:", file_name)
            raise
        if col == 'Nombre del Sujeto Obligado':
            df[col] = d['value']
        elif col == 'Formato':
            formato = d['value']
    if formato != contract_type_full:
        print(f'Archivo {file_name} tiene un tipo de contracto inválido')
        return None, None

    # Standardize column names
    df.columns = df.columns.str.strip().str.upper().str.replace(',', '')\
                                       .str.replace('  ', ' ')

    # Reorder the columns
    cols = list(df.columns)
    if state_name is None:
        cols = [cols[0]] + cols[-1:] + cols[1:-1]
    else:
        cols = [cols[0]] + cols[-2:] + cols[1:-2]
    df = df[cols]

    extra_df = None

    if extra_step_lp:
        # Get data from extra tab for 'Personas físicas o morales con proposición u oferta' column in licitaciones públicas
        need_extra_tab = False
        for c in cols:
            if 'PERSONAS FÍSICAS O MORALES CON PROPOSICIÓN U OFERTA' in c:
                need_extra_tab = True
                tabla = c.split('PERSONAS FÍSICAS O MORALES CON PROPOSICIÓN U OFERTA')[1].strip()
                df.rename(
                    columns={c: 'PERSONAS FÍSICAS O MORALES CON PROPOSICIÓN U OFERTA'},
                    inplace=True)
                break
        if need_extra_tab:
            if tabla:
                tabla = tabla[1:-1]  # Strip parentheses
                tab_options = [tabla, tabla.title(), tabla.replace('_', '')]
                for tab in tab_options:
                    try:
                        extra_df = pd.read_excel(file_name, sheet_name=tab)
                        break
                    except:
                        continue
            else:
                # Tab name not given
                all_tabs = pd.read_excel(file_name, sheet_name=None)
                target_cols = {
                    'ID',
                    'NOMBRE(S)',
                    'PRIMER APELLIDO',
                    'SEGUNDO APELLIDO',
                    'DENOMINACIÓN O RAZÓN SOCIAL',
                    'RFC DE LAS PERSONAS FÍSICAS O MORALES QUE PRESENTARON UNA PROPOSICIÓN U OFERTA'}
                for _, tab_df in all_tabs.items():
                    try:
                        tab_df.dropna(inplace=True)
                        if target_cols.issubset(set(tab_df.iloc[0].str.strip().str.upper())):
                            extra_df = tab_df
                            break
                    except:
                        continue
            if extra_df is not None:
                extra_df.dropna(inplace=True)
                if len(extra_df) > 0:
                    new_header = extra_df.iloc[0]  # Grab the first row for the header
                    extra_df = extra_df[1:]  # Keep the rows after the header row
                    extra_df.columns = new_header.str.strip().str.upper()
                    extra_df['ESTADO'] = state_name.upper()
                    cols = list(extra_df)
                    cols = [cols[-1]] + cols[:-1]
                    extra_df = extra_df[cols]
                else:
                    extra_df = None

    return df, extra_df


if __name__ == "__main__":
    args = sys.argv

    input_dir = None
    output_file = None

    if len(args) != 4:
        print(usage)
    
    else:
        for arg in args[1:]:
            if "--input_dir=" in arg:
                input_dir = arg.split('--input_dir=')[1]
                if input_dir[-1] != '/':
                    input_dir += '/'
            elif "--output_file=" in arg:
                output_file = arg.split('--output_file=')[1]
            elif "--type=" in arg:
                contract_type = arg.split('--type=')[1]
            else:
                print(f"Unknown argument '{arg}'")
                print(usage)
        if input_dir and output_file:
            print("input_dir:", input_dir)
            print("output_file:", output_file)
            print("type:", contract_type)
            run_etl(input_dir, output_file, contract_type)
