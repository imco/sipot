import csv
import glob
import pandas as pd
import sys


usage = """
Usage:
  join_excel_and_csv_files.py --input_dir=str --output_file=str

Example:
  python scripts/join_excel_and_csv_files.py --input_dir=/Users/me/Documents/github/sipot/data/adjudicaciones/2020/ --output_file=/Users/me/Downloads/sipot-federal-adjudicaciones2020.csv --type=licitaciones


Input options (required):
  --input_dir=<str>    /path/to/directory/containing/raw_excel_and_csv_files/ 
  --output_file=<str>  /path/to/output_csv_filename_with_aggregated_results.csv
  --type=<str>         Must be adjudicaciones OR licitaciones

"""


def run_etl(input_dir, output_file, contract_type):
    if contract_type.lower() not in {'adjudicaciones', 'licitaciones'}:
        print("Opción 'type' debe ser 'adjudicaciones' o 'licitaciones'.")
        return
    if contract_type.lower() == 'licitaciones':
        formato_val = 'Procedimientos de licitación pública e invitación a cuando menos tres personas'
    elif contract_type.lower() == 'adjudicaciones':
        formato_val = 'Procedimientos de adjudicación directa'

    main_df = None

    excel_files = glob.glob(f'{input_dir}*.xls')
    excel_files.extend(glob.glob(f'{input_dir}*.xlsx'))
    csv_files = glob.glob(f'{input_dir}**/*.csv', recursive=True)

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
        f'{len(csv_files_clean)} archivos csv en el directorio {input_dir}'))

    for f in excel_files:
        df = process_df(f, 'excel', formato_val)
        if df is None:
            continue
        elif main_df is None:
            main_df = df
        else:
            main_df = pd.concat([main_df, df], axis=0, ignore_index=True)

    for f in csv_files_clean:
        df = process_df(f, 'csv', formato_val)
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


def process_df(file_name, file_type, contract_type_full):
    if file_type == 'excel':
        df = pd.read_excel(file_name, header=5)
    elif file_type == 'csv':
        df = pd.read_csv(file_name, encoding='latin-1', skiprows=3)
    else:
        print("ERROR: 'file_type' debe ser 'excel' o 'csv'.")
        return

    # If file path contains 'estados', add the state name to new column
    state_name = None
    formato = None
    if '/estados/' in file_name:
        state_name = file_name.split('estados/')[1].split('/')[0]
        if state_name:
            df['ESTADO'] = state_name.upper()
    
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
        return

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

    return df


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
